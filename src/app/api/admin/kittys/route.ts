import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { hashPassword, jsonError, requireRole } from "@/lib/auth";
import { looksLikeUsername, originAllowed, sanitizeText } from "@/lib/security";
import { bustCatalog } from "@/lib/catalog";

export async function GET() {
  const ctx = await requireRole(["ADMIN"]);
  if (!ctx) return jsonError("No autorizado", 403);
  const rows = await db.kittyProfile.findMany({ include: { user: true }, orderBy: { createdAt: "desc" } });
  return NextResponse.json({
    kittys: rows.map((k) => ({
      id: k.id,
      slug: k.slug,
      displayName: k.user.displayName,
      username: k.user.username,
      isAvailable: k.isAvailable,
      featured: k.featured,
      city: k.city,
      bio: k.bio,
      tagline: k.tagline,
    })),
  });
}

const schema = z.object({
  username: z.string().min(3).max(20),
  password: z.string().min(8).max(72),
  displayName: z.string().min(2).max(40),
  slug: z.string().min(3).max(20),
  tagline: z.string().min(8).max(140),
  bio: z.string().min(8).max(800),
  city: z.string().min(2).max(40),
  ageLabel: z.string().min(2).max(4),
});

export async function POST(req: NextRequest) {
  if (!originAllowed(req)) return jsonError("Origen no permitido", 403);
  const ctx = await requireRole(["ADMIN"]);
  if (!ctx) return jsonError("No autorizado", 403);
  const body = schema.safeParse(await req.json().catch(() => null));
  if (!body.success) return jsonError("Datos incompletos para registrar kitty");
  const username = sanitizeText(body.data.username, 20).toLowerCase();
  const slug = sanitizeText(body.data.slug, 20).toLowerCase();
  if (!looksLikeUsername(username) || !looksLikeUsername(slug)) return jsonError("Usuario/slug inválidos");
  const exists = await db.user.findUnique({ where: { username } });
  if (exists) return jsonError("Usuario ocupado");
  const user = await db.user.create({
    data: {
      username,
      passwordHash: await hashPassword(body.data.password),
      role: "KITTY",
      displayName: sanitizeText(body.data.displayName, 40),
      wallet: { create: { balance: 0 } },
      kittyProfile: {
        create: {
          slug,
          tagline: sanitizeText(body.data.tagline, 140),
          bio: sanitizeText(body.data.bio, 800),
          city: sanitizeText(body.data.city, 40),
          ageLabel: sanitizeText(body.data.ageLabel, 4),
          tags: JSON.stringify(["nueva"]),
          avatarPath: "/media/processed/mika/card.webp",
          coverPath: "/media/processed/mika/desktop.webp",
        },
      },
    },
  });
  bustCatalog();
  return NextResponse.json({ ok: true, id: user.id });
}
