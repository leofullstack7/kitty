import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jwtVerify } from "jose";

const encoder = new TextEncoder();
const OPEN_API = new Set(["/api/auth/login", "/api/auth/register", "/api/auth/register-kitty", "/api/heroes", "/api/geo", "/api/tips"]);

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (OPEN_API.has(pathname) || pathname.startsWith("/api/heroes")) {
    return NextResponse.next();
  }

  const token = req.cookies.get("kitty_session")?.value;
  if (!token) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  try {
    const secret = process.env.JWT_SECRET;
    if (!secret) return NextResponse.next();
    const { payload } = await jwtVerify(token, encoder.encode(secret));
    const role = String(payload.role ?? "");

    if ((pathname === "/admin" || pathname.startsWith("/admin/")) && role !== "ADMIN") {
      return NextResponse.redirect(new URL("/explore", req.url));
    }
    if ((pathname === "/studio" || pathname.startsWith("/studio/")) && role !== "KITTY" && role !== "ADMIN") {
      return NextResponse.redirect(new URL("/explore", req.url));
    }
    return NextResponse.next();
  } catch {
    const res = pathname.startsWith("/api/")
      ? NextResponse.json({ error: "Sesión inválida" }, { status: 401 })
      : NextResponse.redirect(new URL("/login", req.url));
    res.cookies.set("kitty_session", "", { path: "/", maxAge: 0 });
    return res;
  }
}

export const config = {
  matcher: ["/admin", "/admin/:path*", "/studio", "/studio/:path*", "/inbox", "/inbox/:path*", "/wallet", "/wallet/:path*", "/call/:path*", "/api/:path*"],
};
