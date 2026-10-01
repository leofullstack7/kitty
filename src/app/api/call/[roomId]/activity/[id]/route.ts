import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { jsonError, requireRole } from "@/lib/auth";
import { originAllowed } from "@/lib/security";
import { ORB_COP_VALUE } from "@/lib/constants";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ roomId: string; id: string }> }) {
  if (!originAllowed(req)) return jsonError("Origen no permitido", 403);
  const ctx = await requireRole(["KITTY", "ADMIN"]);
  if (!ctx) return jsonError("No autorizado", 403);
  const { roomId, id } = await params;
  const { status } = (await req.json().catch(() => ({}))) as { status?: string };
  if (status !== "ACCEPTED" && status !== "REJECTED") return jsonError("Estado inválido");

  const call = await db.callSession.findUnique({
    where: { roomId },
    include: {
      kitty: { include: { user: { include: { wallet: true } } } },
      user: { include: { wallet: true } },
    },
  });
  if (!call || call.status === "ENDED") return jsonError("Sala no válida", 404);
  if (ctx.user.role === "KITTY" && call.kittyId !== ctx.user.kittyProfile?.id) {
    return jsonError("Solo la anfitriona decide", 403);
  }

  const activity = await db.callActivity.findFirst({ where: { id, callId: call.id, status: "PENDING" } });
  if (!activity) return jsonError("Esa propuesta ya no está pendiente");

  if (status === "REJECTED") {
    await db.callActivity.update({ where: { id }, data: { status: "REJECTED", resolvedAt: new Date() } });
    return NextResponse.json({ ok: true, status: "REJECTED" });
  }

  const wallet = call.user.wallet;
  if (!wallet || wallet.balance < activity.userPays) {
    await db.callActivity.update({ where: { id }, data: { status: "REJECTED", resolvedAt: new Date() } });
    return jsonError("Ya no le alcanzan los orbes");
  }

  const kittyWallet =
    call.kitty.user.wallet ??
    (await db.wallet.create({ data: { userId: call.kitty.userId, balance: 0 } }));

  await db.$transaction(async (tx) => {
    await tx.wallet.update({
      where: { id: wallet.id },
      data: { balance: { decrement: activity.userPays } },
    });
    await tx.orbeTransaction.create({
      data: {
        walletId: wallet.id,
        type: "SPEND",
        orbes: -activity.userPays,
        copValue: activity.userPays * ORB_COP_VALUE,
        note: `Actividad en sala ${roomId}`,
        meta: JSON.stringify({ activityId: activity.id, kittyNet: activity.kittyNet }),
      },
    });
    await tx.wallet.update({
      where: { id: kittyWallet.id },
      data: { balance: { increment: activity.kittyNet } },
    });
    await tx.orbeTransaction.create({
      data: {
        walletId: kittyWallet.id,
        type: "EARN",
        orbes: activity.kittyNet,
        copValue: activity.kittyNet * ORB_COP_VALUE,
        note: `Actividad aceptada · ${activity.activity}`,
        meta: JSON.stringify({ activityId: activity.id, roomId }),
      },
    });
    await tx.callActivity.update({ where: { id }, data: { status: "ACCEPTED", resolvedAt: new Date() } });
    await tx.orbeBurst.create({
      data: { callId: call.id, orbes: activity.orbes, activity: activity.activity },
    });
  });

  return NextResponse.json({ ok: true, status: "ACCEPTED", orbes: activity.orbes, activity: activity.activity });
}
