import { NextRequest, NextResponse } from "next/server";
import { jsonError, requireRole } from "@/lib/auth";
import { originAllowed } from "@/lib/security";
import { kickGuestFromRoom } from "@/lib/occupancy";

export async function POST(req: NextRequest, { params }: { params: Promise<{ roomId: string }> }) {
  if (!originAllowed(req)) return jsonError("Origen no permitido", 403);
  const ctx = await requireRole(["KITTY", "ADMIN"]);
  if (!ctx?.user.id) return jsonError("No autorizado", 403);
  const { roomId } = await params;
  const result = await kickGuestFromRoom(roomId, ctx.user.id);
  if (!("ok" in result)) return jsonError(result.error, result.status);
  return NextResponse.json({ ok: true, guest: result.guest });
}
