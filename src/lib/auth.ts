import bcrypt from "bcryptjs";
import { NextRequest, NextResponse } from "next/server";
import { db } from "./db";
import { LOGIN_MAX_ATTEMPTS, LOCK_MINUTES, type Role } from "./constants";
import { getClientIp } from "./security";
import { getSession, signSession } from "./session-token";

export {
  getSession,
  signSession,
  readSessionToken,
  sessionCookie,
  clearSessionCookie,
  type SessionPayload,
} from "./session-token";

export async function hashPassword(plain: string) {
  return bcrypt.hash(plain, 12);
}

export async function verifyPassword(plain: string, hash: string) {
  return bcrypt.compare(plain, hash);
}

export async function authenticate(username: string, password: string, req: NextRequest) {
  const user = await db.user.findUnique({
    where: { username: username.toLowerCase() },
    include: { kittyProfile: true },
  });
  const ip = getClientIp(req);

  if (!user || !user.isActive) {
    await db.auditLog.create({ data: { action: "LOGIN_FAIL", ip, meta: JSON.stringify({ username }) } });
    return { error: "Credenciales inválidas" as const };
  }
  if (user.lockedUntil && user.lockedUntil > new Date()) {
    return { error: "Cuenta temporalmente bloqueada. Intenta más tarde." as const };
  }

  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) {
    const fails = user.failedLogins + 1;
    const lockedUntil = fails >= LOGIN_MAX_ATTEMPTS ? new Date(Date.now() + LOCK_MINUTES * 60_000) : null;
    await db.user.update({
      where: { id: user.id },
      data: { failedLogins: fails, lockedUntil },
    });
    await db.auditLog.create({
      data: { userId: user.id, action: "LOGIN_FAIL", ip, meta: JSON.stringify({ fails }) },
    });
    return { error: "Credenciales inválidas" as const };
  }

  await db.user.update({
    where: { id: user.id },
    data: { failedLogins: 0, lockedUntil: null, lastLoginAt: new Date(), lastLoginIp: ip },
  });
  await db.auditLog.create({ data: { userId: user.id, action: "LOGIN_OK", ip, meta: "{}" } });

  const token = await signSession({
    sub: user.id,
    username: user.username,
    role: user.role as Role,
    displayName: user.displayName,
  });
  return { token, user };
}

export function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export async function requireSession() {
  const session = await getSession();
  if (!session) return null;
  const user = await db.user.findUnique({
    where: { id: session.sub },
    select: {
      id: true,
      username: true,
      role: true,
      displayName: true,
      isActive: true,
      kittyProfile: { select: { id: true, slug: true, isAvailable: true } },
      wallet: { select: { balance: true } },
    },
  });
  if (!user || !user.isActive) return null;
  return { session, user };
}

export async function requireRole(roles: Role[]) {
  const ctx = await requireSession();
  if (!ctx) return null;
  if (!roles.includes(ctx.user.role as Role)) return null;
  return ctx;
}
