import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { SESSION_HOURS, type Role } from "./constants";

const encoder = new TextEncoder();
export const SESSION_COOKIE = "kitty_session";

export type SessionPayload = {
  sub: string;
  username: string;
  role: Role;
  displayName: string;
};

function secret() {
  const value = process.env.JWT_SECRET;
  if (!value) throw new Error("JWT_SECRET missing");
  return encoder.encode(value);
}

export async function signSession(payload: SessionPayload) {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_HOURS}h`)
    .sign(secret());
}

export async function readSessionToken(token: string) {
  const { payload } = await jwtVerify(token, secret());
  return payload as unknown as SessionPayload;
}

export async function getSession() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  try {
    return await readSessionToken(token);
  } catch {
    return null;
  }
}

function cookieSecure() {
  const origin = process.env.APP_ORIGIN ?? "";
  return origin.startsWith("https://") || process.env.VERCEL === "1";
}

export function sessionCookie(token: string) {
  return {
    name: SESSION_COOKIE,
    value: token,
    httpOnly: true,
    sameSite: "lax" as const,
    secure: cookieSecure(),
    path: "/",
    maxAge: SESSION_HOURS * 60 * 60,
  };
}

export function clearSessionCookie() {
  return {
    name: SESSION_COOKIE,
    value: "",
    httpOnly: true,
    sameSite: "lax" as const,
    secure: cookieSecure(),
    path: "/",
    maxAge: 0,
  };
}
