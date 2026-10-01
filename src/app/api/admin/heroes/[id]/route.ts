import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { jsonError, requireRole } from "@/lib/auth";
import { originAllowed } from "@/lib/security";
import { bustCatalog } from "@/lib/catalog";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!originAllowed(req)) return jsonError("Origen no permitido", 403);
  const ctx = await requireRole(["ADMIN"]);
  if (!ctx) return jsonError("No autorizado", 403);
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as { active?: boolean; title?: string; subtitle?: string };
  await db.heroBanner.update({ where: { id }, data: { active: body.active, title: body.title, subtitle: body.subtitle } });
  bustCatalog();
  return NextResponse.json({ ok: true });
}
