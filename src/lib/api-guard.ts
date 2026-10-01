import { NextRequest, NextResponse } from "next/server";
import { requireRole, requireSession, jsonError } from "./auth";
import { originAllowed } from "./security";
import { rateLimit } from "./rate-limit";
import { getClientIp } from "./security";
import type { Role } from "./constants";

export function guardOrigin(req: NextRequest) {
  if (req.method !== "GET" && req.method !== "HEAD" && !originAllowed(req)) {
    return jsonError("Origen no permitido", 403);
  }
  return null;
}

export function guardRate(req: NextRequest, key: string, limit: number, windowMs: number) {
  const ip = getClientIp(req);
  const hit = rateLimit(`${key}:${ip}`, limit, windowMs);
  if (!hit.ok) return jsonError("Demasiadas solicitudes. Espera un momento.", 429);
  return null;
}

export async function withUser() {
  const ctx = await requireSession();
  if (!ctx) return { error: jsonError("No autenticado", 401) as NextResponse, ctx: null };
  return { error: null, ctx };
}

export async function withRole(roles: Role[]) {
  const ctx = await requireRole(roles);
  if (!ctx) return { error: jsonError("No autorizado", 403) as NextResponse, ctx: null };
  return { error: null, ctx };
}
