import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { jsonError, requireRole } from "@/lib/auth";
import { originAllowed, sanitizeText } from "@/lib/security";
import { bustCatalog } from "@/lib/catalog";
import { listTips } from "@/lib/tips";
import { localModerate } from "@/lib/moderation";

const schema = z.object({
  title: z.string().min(3).max(80),
  orbes: z.number().int().min(1).max(200),
});

export async function GET() {
  const ctx = await requireRole(["KITTY", "ADMIN"]);
  if (!ctx?.user.kittyProfile) return jsonError("No autorizado", 403);
  const tips = await listTips(ctx.user.kittyProfile.id, false);
  return NextResponse.json({ tips });
}

export async function POST(req: NextRequest) {
  if (!originAllowed(req)) return jsonError("Origen no permitido", 403);
  const ctx = await requireRole(["KITTY"]);
  if (!ctx?.user.kittyProfile) return jsonError("No autorizado", 403);
  const body = schema.safeParse(await req.json().catch(() => null));
  if (!body.success) return jsonError("Escribe la acción y cuántos orbes vale (1 a 200).");
  const title = sanitizeText(body.data.title, 80);
  const mod = localModerate(title);
  if (!mod.allowed) return jsonError(mod.reason);

  const count = await db.kittyTip.count({ where: { kittyId: ctx.user.kittyProfile.id } });
  if (count >= 20) return jsonError("Ya tienes 20 acciones. Quita una para agregar otra.");

  const tip = await db.kittyTip.create({
    data: {
      kittyId: ctx.user.kittyProfile.id,
      title: mod.rewritten,
      orbes: body.data.orbes,
      sortOrder: count,
    },
  });
  bustCatalog();
  return NextResponse.json({ ok: true, tip });
}
