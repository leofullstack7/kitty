import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { db } from "@/lib/db";
import { hashPassword, jsonError, sessionCookie, signSession } from "@/lib/auth";
import { looksLikeUsername, originAllowed, sanitizeText } from "@/lib/security";
import { guardRate } from "@/lib/api-guard";

const schema = z.object({
  username: z.string().min(3).max(20),
  password: z.string().min(8).max(72),
  displayName: z.string().min(2).max(40),
});

export async function POST(req: NextRequest) {
  if (!originAllowed(req)) return jsonError("Origen no permitido", 403);
  const limited = guardRate(req, "register", 5, 60_000);
  if (limited) return limited;
  const body = schema.safeParse(await req.json().catch(() => null));
  if (!body.success) return jsonError("Revisa usuario, nombre y clave (mín. 8).");
  const username = sanitizeText(body.data.username, 20).toLowerCase();
  if (!looksLikeUsername(username)) return jsonError("Usuario: 3-20 letras, números o _");
  const displayName = sanitizeText(body.data.displayName, 40);
  const exists = await db.user.findUnique({ where: { username } });
  if (exists) return jsonError("Ese usuario ya existe");
  const user = await db.user.create({
    data: {
      username,
      passwordHash: await hashPassword(body.data.password),
      role: "USER",
      displayName,
      wallet: { create: { balance: 15 } },
    },
  });
  const token = await signSession({
    sub: user.id,
    username: user.username,
    role: "USER",
    displayName: user.displayName,
  });
  const cookie = sessionCookie(token);
  (await cookies()).set(cookie);
  const res = NextResponse.json({ ok: true, role: "USER" });
  res.cookies.set(cookie);
  return res;
}
