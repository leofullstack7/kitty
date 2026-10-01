import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { jsonError, requireRole } from "@/lib/auth";
import { originAllowed, sanitizeText } from "@/lib/security";
import { bustCatalog } from "@/lib/catalog";
import { localModerate } from "@/lib/moderation";

const schema = z.object({
  title: z.string().min(3).max(80).optional(),
  orbes: z.number().int().min(1).max(200).optional(),
  active: z.boolean().optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!originAllowed(req)) return jsonError("Origen no permitido", 403);
  const ctx = await requireRole(["KITTY"]);
  if (!ctx?.user.kittyProfile) return jsonError("No autorizado", 403);
  const { id } = await params;
  const body = schema.safeParse(await req.json().catch(() => null));
  if (!body.success) return jsonError("Datos inválidos");

  const tip = await db.kittyTip.findFirst({ where: { id, kittyId: ctx.user.kittyProfile.id } });
  if (!tip) return jsonError("Esa acción no es tuya", 404);

  const data: { title?: string; orbes?: number; active?: boolean } = {};
  if (body.data.title) {
    const title = sanitizeText(body.data.title, 80);
    const mod = localModerate(title);
    if (!mod.allowed) return jsonError(mod.reason);
    data.title = mod.rewritten;
  }
  if (body.data.orbes != null) data.orbes = body.data.orbes;
  if (body.data.active != null) data.active = body.data.active;

  await db.kittyTip.update({ where: { id }, data });
  bustCatalog();
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!originAllowed(req)) return jsonError("Origen no permitido", 403);
  const ctx = await requireRole(["KITTY"]);
  if (!ctx?.user.kittyProfile) return jsonError("No autorizado", 403);
  const { id } = await params;
  const tip = await db.kittyTip.findFirst({ where: { id, kittyId: ctx.user.kittyProfile.id } });
  if (!tip) return jsonError("Esa acción no es tuya", 404);
  await db.kittyTip.delete({ where: { id } });
  bustCatalog();
  return NextResponse.json({ ok: true });
}
