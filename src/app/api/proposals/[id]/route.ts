import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { db } from "@/lib/db";
import { jsonError, requireRole } from "@/lib/auth";
import { originAllowed } from "@/lib/security";
import { ORB_COP_VALUE } from "@/lib/constants";
import { bustCatalog } from "@/lib/catalog";
import { kittyIsBusy, markKittyBusy } from "@/lib/occupancy";

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
    return jsonError("Ya estás en otra noche. Termínala antes de aceptar otro JOIN.");
  }

  const wallet = proposal.user.wallet;
  if (!wallet || wallet.balance < proposal.userPays) {
    await db.proposal.update({ where: { id }, data: { status: "EXPIRED", resolvedAt: new Date() } });
    return jsonError("El user ya no tiene orbes suficientes");
  }

  const roomId = randomBytes(12).toString("hex");
  await db.$transaction(async (tx) => {
    await tx.wallet.update({
      where: { id: wallet.id },
      data: { balance: { decrement: proposal.userPays } },
    });
    await tx.orbeTransaction.create({
      data: {
        walletId: wallet.id,
        type: "SPEND",
        orbes: -proposal.userPays,
        copValue: proposal.userPays * ORB_COP_VALUE,
        note: `JOIN aceptado · fee ${proposal.platformFee} · kitty ${proposal.kittyNet}`,
        meta: JSON.stringify({ proposalId: proposal.id, platformFee: proposal.platformFee, kittyNet: proposal.kittyNet }),
      },
    });
    if (proposal.bonusId) {
      await tx.bonus.update({ where: { id: proposal.bonusId }, data: { status: "USED", usedAt: new Date() } });
    }
    await tx.proposal.update({ where: { id }, data: { status: "ACCEPTED", resolvedAt: new Date() } });
    await tx.callSession.create({
      data: {
        roomId,
        proposalId: proposal.id,
        userId: proposal.userId,
        kittyId: proposal.kittyId,
        status: "WAITING",
      },
    });
    await tx.notification.create({
      data: {
        userId: proposal.userId,
        title: "JOIN aceptado",
        body: "Ella dijo que sí. Entra a la videollamada.",
        href: `/call/${roomId}`,
      },
    });
    await markKittyBusy(tx, proposal.kittyId, roomId);
  });

  bustCatalog();
  return NextResponse.json({ ok: true, roomId });
}
