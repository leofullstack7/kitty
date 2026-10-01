import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { authenticate, sessionCookie, jsonError } from "@/lib/auth";
import { looksLikeUsername, sanitizeText, originAllowed } from "@/lib/security";
import { guardRate } from "@/lib/api-guard";

const schema = z.object({
  username: z.string().min(3).max(20),
  password: z.string().min(8).max(128),
});

export async function POST(req: NextRequest) {
  if (!originAllowed(req)) return jsonError("Origen no permitido", 403);
  const limited = guardRate(req, "login", 20, 60_000);
  if (limited) return limited;
  const body = schema.safeParse(await req.json().catch(() => null));
  if (!body.success) return jsonError("Usuario o clave inválidos");
  const username = sanitizeText(body.data.username, 20).toLowerCase();
  if (!looksLikeUsername(username)) return jsonError("Usuario inválido");
  const result = await authenticate(username, body.data.password, req);
  if ("error" in result && result.error) return jsonError(result.error, 401);
  const cookie = sessionCookie(result.token!);
  const jar = await cookies();
  jar.set(cookie);
  const res = NextResponse.json({ ok: true, role: result.user!.role });
  res.cookies.set(cookie);
  return res;
}
