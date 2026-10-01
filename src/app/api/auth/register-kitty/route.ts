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
  slug: z.string().max(20).optional(),
  tagline: z.string().max(140).optional(),
  bio: z.string().max(800).optional(),
  city: z.string().max(40).optional(),
  ageLabel: z.union([z.string(), z.number()]).optional(),
});

function handleFrom(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9_]+/g, "")
    .slice(0, 20);
}

async function uniqueHandle(base: string) {
  const seed = handleFrom(base);
  const start = seed.length >= 3 ? seed : `${seed}kitty`.slice(0, 20);
  for (let i = 0; i < 30; i++) {
    const next = i === 0 ? start : `${start.slice(0, 16)}${i + 1}`;
    const [user, profile] = await Promise.all([
      db.user.findUnique({ where: { username: next }, select: { id: true } }),
      db.kittyProfile.findUnique({ where: { slug: next }, select: { id: true } }),
    ]);
    if (!user && !profile) return next;
  }
  return null;
}

export async function POST(req: NextRequest) {
  if (!originAllowed(req)) return jsonError("Origen no permitido", 403);
  const limited = guardRate(req, "register-kitty", 8, 60_000);
  if (limited) return limited;

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return jsonError("Falta el nombre, el usuario o una clave de mínimo 8 caracteres.");
  }

  const displayName = sanitizeText(parsed.data.displayName, 40);
  if (displayName.length < 2) return jsonError("Escribe cómo te van a ver en el salón.");

  const wanted = handleFrom(parsed.data.username || displayName);
  if (wanted.length < 3) return jsonError("El usuario necesita al menos 3 letras o números, sin espacios.");

  const password = parsed.data.password;
  if (password.length < 8) return jsonError("La clave tiene que tener mínimo 8 caracteres.");

  const slugWanted = handleFrom(parsed.data.slug || wanted);
  const username = wanted;
  if (!looksLikeUsername(username)) return jsonError("Usuario: solo letras, números o _");

  const userTaken = await db.user.findUnique({ where: { username }, select: { id: true } });
  if (userTaken) {
    const suggestion = await uniqueHandle(username);
    return jsonError(suggestion ? `Ese usuario ya existe. Prueba con ${suggestion}.` : "Ese usuario ya existe.");
  }

  let slug = slugWanted.length >= 3 ? slugWanted : username;
  const slugTaken = await db.kittyProfile.findUnique({ where: { slug }, select: { id: true } });
  if (slugTaken) {
    const suggestion = await uniqueHandle(slug);
    if (!suggestion) return jsonError("Ese nombre en el salón ya está tomado.");
    slug = suggestion;
  }

  const age = Number(parsed.data.ageLabel ?? 25);
  const ageLabel = Number.isInteger(age) && age >= 21 && age <= 65 ? String(age) : "25";
  const city = sanitizeText(parsed.data.city || "Medellín", 40) || "Medellín";
  const tagline =
    sanitizeText(parsed.data.tagline || "", 140) || "Disponible para noches privadas. El JOIN lo pones tú.";
  const bio =
    sanitizeText(parsed.data.bio || "", 800) ||
    `${displayName} acaba de entrar a la casa. Enciende su studio y ofrécele un JOIN.`;

  try {
    const user = await db.user.create({
      data: {
        username,
        passwordHash: await hashPassword(password),
        role: "KITTY",
        displayName,
        wallet: { create: { balance: 0 } },
        kittyProfile: {
          create: {
            slug,
            tagline,
            bio,
            city,
            ageLabel,
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
    const res = NextResponse.json({ ok: true, role: "KITTY", slug, username });
    res.cookies.set(cookie);
    return res;
  } catch (err) {
    console.error("register-kitty", err);
    return jsonError("No se pudo abrir el perfil. Intenta con otro usuario.");
  }
}
