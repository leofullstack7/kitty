import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { jsonError, requireSession } from "@/lib/auth";
import { originAllowed } from "@/lib/security";
import { bustCatalog } from "@/lib/catalog";
import { clearKittyBusy } from "@/lib/occupancy";

export async function POST(req: NextRequest, { params }: { params: Promise<{ roomId: string }> }) {
  if (!originAllowed(req)) return jsonError("Origen no permitido", 403);
  const ctx = await requireSession();
  if (!ctx) return jsonError("No autenticado", 401);
  const { roomId } = await params;
  const call = await db.callSession.findUnique({
    where: { roomId },
    include: { kitty: true, guestKitty: true },
  });
  if (!call) return jsonError("Sala no válida", 404);
  const isHost = ctx.user.id === call.kitty.userId;
  const isUser = ctx.user.id === call.userId;
  const isGuest = ctx.user.id === call.guestKitty?.userId;
  if (!isHost && !isUser && !isGuest && ctx.user.role !== "ADMIN") return jsonError("No estás en esta noche", 403);

  if (isGuest && !isHost && !isUser) {
    await db.$transaction(async (tx) => {
      await tx.callSession.update({ where: { id: call.id }, data: { guestKittyId: null } });
      await clearKittyBusy(tx, call.guestKittyId!, roomId);
    });
    bustCatalog();
    return NextResponse.json({ ok: true, left: "guest" });
  }

  await db.$transaction(async (tx) => {
    await tx.callSession.update({
      where: { id: call.id },
      data: { status: "ENDED", endedAt: new Date(), guestKittyId: call.guestKittyId },
    });
    await tx.callActivity.updateMany({
      where: { callId: call.id, status: "PENDING" },
      data: { status: "REJECTED", resolvedAt: new Date() },
    });
    await tx.callInvite.updateMany({
      where: { callId: call.id, status: "PENDING" },
      data: { status: "DECLINED", resolvedAt: new Date() },
    });
    await clearKittyBusy(tx, call.kittyId, roomId);
    if (call.guestKittyId) await clearKittyBusy(tx, call.guestKittyId, roomId);
  });
  bustCatalog();
  return NextResponse.json({ ok: true, left: "ended" });
}
