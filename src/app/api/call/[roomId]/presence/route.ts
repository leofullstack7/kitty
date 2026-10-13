import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { jsonError, requireSession } from "@/lib/auth";
import { originAllowed } from "@/lib/security";
import { guestLiveNow, touchCallPresence } from "@/lib/occupancy";

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

  const wasGuest = ctx.user.id === call.guestKitty?.userId;
  const allowed =
    ctx.user.id === call.userId ||
    ctx.user.id === call.kitty.userId ||
    wasGuest ||
    ctx.user.role === "ADMIN";
  if (!allowed) return jsonError("No estás en esta noche", 403);

  const result = await touchCallPresence(roomId, ctx.user.id);
  const kicked = result.kicked || (wasGuest && !result.call?.guestKittyId);
  if (kicked) {
    return NextResponse.json({ ok: true, kicked: true, guestLive: false, guestId: null, status: result.call?.status ?? call.status });
  }
  if (!result.call || result.call.status === "ENDED") return jsonError("Esa noche ya no está activa", 410);

  const fresh = await db.callSession.findUnique({
    where: { roomId },
    select: { phase: true, endsAt: true, status: true, guestKittyId: true, guestSeenAt: true },
  });

  return NextResponse.json({
    ok: true,
    kicked: false,
    guestLive: result.guestLive || guestLiveNow(fresh?.guestSeenAt ?? result.call.guestSeenAt),
    guestId: result.call.guestKittyId,
    status: fresh?.status ?? result.call.status,
    phase: fresh?.phase ?? "ROOM",
    endsAt: fresh?.endsAt?.toISOString() ?? null,
  });
}
