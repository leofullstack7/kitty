import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { db } from "@/lib/db";
import { jsonError, requireRole } from "@/lib/auth";
import { originAllowed } from "@/lib/security";
import { bustCatalog } from "@/lib/catalog";
import { kittyIsBusy, markKittyBusy } from "@/lib/occupancy";
import { BEATS, chargeUserPayKitty } from "@/lib/call-economy";
import { PREVIEW_MINUTES } from "@/lib/constants";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!originAllowed(req)) return jsonError("Origen no permitido", 403);
  const ctx = await requireRole(["KITTY", "ADMIN"]);
  if (!ctx) return jsonError("No autorizado", 403);
  const { id } = await params;
  const { status } = (await req.json().catch(() => ({}))) as { status?: string };
  if (status !== "ACCEPTED" && status !== "IGNORED") return jsonError("Estado inválido");

  const proposal = await db.proposal.findUnique({
    where: { id },
    include: { kitty: true, user: { include: { wallet: true } } },
  });
  if (!proposal || proposal.status !== "PENDING") return jsonError("Solicitud no disponible");
  if (ctx.user.role === "KITTY" && proposal.kittyId !== ctx.user.kittyProfile?.id) return jsonError("No es tuya", 403);

  if (status === "IGNORED") {
    await db.proposal.update({ where: { id }, data: { status: "IGNORED", resolvedAt: new Date() } });
    return NextResponse.json({ ok: true });
  }

  if (await kittyIsBusy(proposal.kittyId)) {
    return jsonError("Ya estás en otra noche. Termínala antes de aceptar otro encuentro.");
  }

  const wallet = proposal.user.wallet;
  const split = BEATS.meet();
  if (!wallet || wallet.balance < split.userPays) {
    await db.proposal.update({ where: { id }, data: { status: "EXPIRED", resolvedAt: new Date() } });
    return jsonError("El user ya no tiene orbes suficientes");
  }

  const roomId = randomBytes(12).toString("hex");
  await db.$transaction(async (tx) => {
    await chargeUserPayKitty(tx, {
      userWalletId: wallet.id,
      kittyUserId: proposal.kitty.userId,
      split,
      spendNote: `Conocer a ${proposal.kittyId}`,
      earnNote: "Alguien pagó por conocerte",
      meta: { proposalId: proposal.id, kind: "meet" },
    });
    await tx.proposal.update({
      where: { id },
      data: { status: "ACCEPTED", resolvedAt: new Date(), userPays: split.userPays, platformFee: split.platformFee, kittyNet: split.kittyNet },
    });
    await tx.callSession.create({
      data: {
        roomId,
        proposalId: proposal.id,
        userId: proposal.userId,
        kittyId: proposal.kittyId,
        status: "WAITING",
        phase: "PREVIEW",
      },
    });
    await tx.notification.create({
      data: {
        userId: proposal.userId,
        title: "Ella te dejó entrar",
        body: `Tienes ${PREVIEW_MINUTES} minutos para conocerla. Si hay chispa, crea una sala.`,
        href: `/call/${roomId}`,
      },
    });
    await markKittyBusy(tx, proposal.kittyId, roomId);
  });

  bustCatalog();
  return NextResponse.json({ ok: true, roomId });
}
