import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { jsonError, requireRole } from "@/lib/auth";
import { originAllowed } from "@/lib/security";
import { BEATS, chargeUserPayKitty } from "@/lib/call-economy";
import { ROOM_MINUTES } from "@/lib/constants";

export async function POST(req: NextRequest, { params }: { params: Promise<{ roomId: string }> }) {
  if (!originAllowed(req)) return jsonError("Origen no permitido", 403);
  const ctx = await requireRole(["USER"]);
  if (!ctx) return jsonError("Solo el user crea la sala", 403);
  const { roomId } = await params;

  const call = await db.callSession.findUnique({
    where: { roomId },
    include: { user: { include: { wallet: true } }, kitty: true },
  });
  if (!call || call.status === "ENDED") return jsonError("Sala no válida", 404);
  if (call.userId !== ctx.user.id) return jsonError("No es tu noche", 403);
  if (call.phase === "ROOM") return jsonError("Esta sala ya está creada");

  const split = BEATS.room();
  const wallet = call.user.wallet;
  if (!wallet || wallet.balance < split.userPays) return jsonError("Necesitas 2 orbes para crear la sala");

  const endsAt = new Date(Date.now() + ROOM_MINUTES * 60_000);
  await db.$transaction(async (tx) => {
    await chargeUserPayKitty(tx, {
      userWalletId: wallet.id,
      kittyUserId: call.kitty.userId,
      split,
      spendNote: `Sala de ${ROOM_MINUTES} min`,
      earnNote: `Sala de ${ROOM_MINUTES} minutos`,
      meta: { roomId, kind: "room" },
    });
    await tx.callSession.update({
      where: { id: call.id },
      data: { phase: "ROOM", status: "LIVE", endsAt, startedAt: call.startedAt ?? new Date() },
    });
  });

  return NextResponse.json({ ok: true, phase: "ROOM", endsAt: endsAt.toISOString(), minutes: ROOM_MINUTES, orbes: split.userPays });
}
