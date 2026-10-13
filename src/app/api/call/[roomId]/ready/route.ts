import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { jsonError, requireSession } from "@/lib/auth";
import { originAllowed } from "@/lib/security";
import { PREVIEW_SECONDS } from "@/lib/constants";

export async function POST(req: NextRequest, { params }: { params: Promise<{ roomId: string }> }) {
  if (!originAllowed(req)) return jsonError("Origen no permitido", 403);
  const ctx = await requireSession();
  if (!ctx) return jsonError("No autenticado", 401);
  const { roomId } = await params;

  const call = await db.callSession.findUnique({
    where: { roomId },
    include: { kitty: true, guestKitty: true },
  });
  if (!call || call.status === "ENDED") return jsonError("Sala no válida", 404);

  const allowed =
    ctx.user.id === call.userId ||
    ctx.user.id === call.kitty.userId ||
    ctx.user.id === call.guestKitty?.userId ||
    ctx.user.role === "ADMIN";
  if (!allowed) return jsonError("No estás en esta noche", 403);

  if (call.phase !== "PREVIEW") {
    return NextResponse.json({ ok: true, phase: call.phase, endsAt: call.endsAt?.toISOString() ?? null });
  }
  if (call.endsAt) {
    return NextResponse.json({ ok: true, phase: call.phase, endsAt: call.endsAt.toISOString() });
  }

  const endsAt = new Date(Date.now() + PREVIEW_SECONDS * 1000);
  await db.callSession.update({
    where: { id: call.id },
    data: { endsAt, status: "LIVE", startedAt: call.startedAt ?? new Date() },
  });

  return NextResponse.json({ ok: true, phase: "PREVIEW", endsAt: endsAt.toISOString() });
}
