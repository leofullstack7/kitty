import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { db } from "@/lib/db";
import { hashPassword, jsonError, sessionCookie, signSession } from "@/lib/auth";
import { looksLikeUsername, originAllowed, sanitizeText } from "@/lib/security";
import { guardRate } from "@/lib/api-guard";
import { bustCatalog } from "@/lib/catalog";

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
  const limited = guardRate(req, "register-kitty", 4, 60_000);
  if (limited) return limited;
  const body = schema.safeParse(await req.json().catch(() => null));
  if (!body.success) return jsonError("Revisa nombre, usuario, clave y tu perfil.");

  const username = sanitizeText(body.data.username, 20).toLowerCase();
  const slug = sanitizeText(body.data.slug, 20).toLowerCase();
  if (!looksLikeUsername(username) || !looksLikeUsername(slug)) {
    return jsonError("Usuario y slug: 3-20 letras, números o _");
  }

  const age = Number(body.data.ageLabel);
  if (!Number.isInteger(age) || age < 21 || age > 65) {
    return jsonError("La edad visible tiene que ser de 21 años en adelante.");
  }

  const displayName = sanitizeText(body.data.displayName, 40);
  const [userTaken, slugTaken] = await Promise.all([
    db.user.findUnique({ where: { username }, select: { id: true } }),
    db.kittyProfile.findUnique({ where: { slug }, select: { id: true } }),
  ]);
  if (userTaken) return jsonError("Ese usuario ya existe");
  if (slugTaken) return jsonError("Ese nombre en el salón ya está tomado");

  const user = await db.user.create({
    data: {
      username,
      passwordHash: await hashPassword(body.data.password),
      role: "KITTY",
      displayName,
      wallet: { create: { balance: 0 } },
      kittyProfile: {
        create: {
          slug,
          tagline: sanitizeText(body.data.tagline, 140),
          bio: sanitizeText(body.data.bio, 800),
          city: sanitizeText(body.data.city, 40),
          ageLabel: String(age),
          tags: JSON.stringify(["nueva"]),
          isAvailable: false,
          avatarPath: "/media/processed/mika/card.webp",
          coverPath: "/media/processed/mika/desktop.webp",
        },
      },
    },
  });

  const token = await signSession({
    sub: user.id,
    username: user.username,
    role: "KITTY",
    displayName: user.displayName,
  });
  const cookie = sessionCookie(token);
  (await cookies()).set(cookie);
  bustCatalog();
  const res = NextResponse.json({ ok: true, role: "KITTY", slug });
  res.cookies.set(cookie);
  return res;
}
