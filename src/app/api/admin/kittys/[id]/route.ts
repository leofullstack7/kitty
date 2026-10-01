import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { hashPassword, jsonError, requireRole } from "@/lib/auth";
import { looksLikeUsername, originAllowed, sanitizeText } from "@/lib/security";
import { bustCatalog } from "@/lib/catalog";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!originAllowed(req)) return jsonError("Origen no permitido", 403);
  const ctx = await requireRole(["ADMIN"]);
  if (!ctx) return jsonError("No autorizado", 403);
  const { id } = await params;
  const kitty = await db.kittyProfile.findUnique({ where: { id }, include: { user: true } });
  if (!kitty) return jsonError("No existe", 404);
  const body = (await req.json().catch(() => ({}))) as Record<string, string>;
  const userData: { username?: string; passwordHash?: string; displayName?: string } = {};
  const profileData: Record<string, string | boolean> = {};
  if (body.username) {
    const username = sanitizeText(body.username, 20).toLowerCase();
    if (!looksLikeUsername(username)) return jsonError("Usuario inválido");
    userData.username = username;
  }
  if (body.password && body.password.length >= 8) userData.passwordHash = await hashPassword(body.password);
  if (body.displayName) userData.displayName = sanitizeText(body.displayName, 40);
  if (body.slug) {
    const slug = sanitizeText(body.slug, 20).toLowerCase();
    if (!looksLikeUsername(slug)) return jsonError("Slug inválido");
    profileData.slug = slug;
  }
  if (body.tagline) profileData.tagline = sanitizeText(body.tagline, 140);
  if (body.bio) profileData.bio = sanitizeText(body.bio, 800);
  if (body.city) profileData.city = sanitizeText(body.city, 40);
  if (body.ageLabel) profileData.ageLabel = sanitizeText(body.ageLabel, 4);
  if (typeof body.featured === "boolean") profileData.featured = body.featured;
  await db.$transaction([
    db.user.update({ where: { id: kitty.userId }, data: userData }),
    db.kittyProfile.update({ where: { id }, data: profileData }),
  ]);
  bustCatalog();
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!originAllowed(req)) return jsonError("Origen no permitido", 403);
  const ctx = await requireRole(["ADMIN"]);
  if (!ctx) return jsonError("No autorizado", 403);
  const { id } = await params;
  const kitty = await db.kittyProfile.findUnique({ where: { id } });
  if (!kitty) return jsonError("No existe", 404);
  await db.user.delete({ where: { id: kitty.userId } });
  bustCatalog();
  return NextResponse.json({ ok: true });
}
