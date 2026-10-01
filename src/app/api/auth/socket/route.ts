import { NextResponse } from "next/server";
import { SignJWT } from "jose";
import { requireSession } from "@/lib/auth";
import { jsonError } from "@/lib/auth";

export async function GET() {
  const ctx = await requireSession();
  if (!ctx) return jsonError("No autenticado", 401);
  const secret = process.env.JWT_SECRET;
  if (!secret) return jsonError("Servidor sin JWT", 500);
  const token = await new SignJWT({
    sub: ctx.user.id,
    username: ctx.user.username,
    role: ctx.user.role,
    displayName: ctx.user.displayName,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("2h")
    .sign(new TextEncoder().encode(secret));
  return NextResponse.json({ token });
}
