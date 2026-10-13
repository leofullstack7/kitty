import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { jsonError, requireRole } from "@/lib/auth";
import { originAllowed } from "@/lib/security";
import { EXTEND_MINUTES, TIME_EXTEND_MARK } from "@/lib/constants";
import { chargeUserPayKitty, splitPaidBeat } from "@/lib/call-economy";

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

  const isTime = activity.activity === TIME_EXTEND_MARK;
  const split = isTime ? splitPaidBeat(activity.orbes) : { userPays: activity.userPays, platformFee: activity.platformFee, kittyNet: activity.kittyNet, original: activity.orbes, percent: 0, valid: true };
  const now = new Date();
  const base = call.endsAt && call.endsAt.getTime() > now.getTime() ? call.endsAt : now;
  const endsAt = isTime ? new Date(base.getTime() + EXTEND_MINUTES * 60_000) : call.endsAt;

  await db.$transaction(async (tx) => {
    await chargeUserPayKitty(tx, {
      userWalletId: wallet.id,
      kittyUserId: call.kitty.userId,
      split,
      spendNote: isTime ? `+${EXTEND_MINUTES} minutos` : `Actividad en sala ${roomId}`,
      earnNote: isTime ? `Tiempo extra · ${EXTEND_MINUTES} min` : `Actividad aceptada · ${activity.activity}`,
      meta: { activityId: activity.id, roomId, kind: isTime ? "extend" : "activity" },
    });
    await tx.callActivity.update({ where: { id }, data: { status: "ACCEPTED", resolvedAt: new Date() } });
    await tx.orbeBurst.create({
      data: { callId: call.id, orbes: activity.orbes, activity: isTime ? `+${EXTEND_MINUTES} minutos` : activity.activity },
    });
    if (isTime && endsAt) {
      await tx.callSession.update({ where: { id: call.id }, data: { endsAt } });
    }
  });

  return NextResponse.json({
    ok: true,
    status: "ACCEPTED",
    orbes: activity.orbes,
    activity: isTime ? `+${EXTEND_MINUTES} minutos` : activity.activity,
    endsAt: endsAt?.toISOString() ?? null,
  });
}
