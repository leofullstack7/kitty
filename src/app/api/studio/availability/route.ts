import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { jsonError, requireRole } from "@/lib/auth";
import { originAllowed } from "@/lib/security";
import { bustCatalog } from "@/lib/catalog";

export async function PATCH(req: NextRequest) {
  if (!originAllowed(req)) return jsonError("Origen no permitido", 403);
  const ctx = await requireRole(["KITTY"]);
  if (!ctx?.user.kittyProfile) return jsonError("No autorizado", 403);
  const { available } = (await req.json().catch(() => ({}))) as { available?: boolean };
  const kitty = await db.kittyProfile.findUnique({
    where: { id: ctx.user.kittyProfile.id },
    select: { busyRoomId: true },
  });
  if (available && kitty?.busyRoomId) {
    return jsonError("Estás en un JOIN. Termina esa noche antes de volver a ponerte disponible.");
  }
  await db.kittyProfile.update({
    where: { id: ctx.user.kittyProfile.id },
    data: { isAvailable: !!available },
  });
  bustCatalog();
  return NextResponse.json({ ok: true, available: !!available });
}
