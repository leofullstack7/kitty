"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { clearSessionCache, useSession } from "./session";

export function Navbar() {
  const { me, refresh } = useSession();
  const router = useRouter();

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
    clearSessionCache();
    await refresh();
    router.replace("/");
  }

  return (
    <header className="sticky top-0 z-50">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4">
        <Link href="/" prefetch className="flex items-center gap-3 hover-lift">
          <img src="/media/brand/logo-kitty.png" alt="KITTY" className="h-10 w-10 rounded-full object-cover shadow-[0_0_24px_#a855f7]" />
          <div>
            <p className="font-serif text-2xl leading-none tracking-[0.2em]">KITTY</p>
            <p className="text-[10px] uppercase tracking-[0.35em] text-orchid/70">private rooms</p>
          </div>
        </Link>
        <nav className="hidden items-center gap-6 text-sm text-orchid/80 md:flex">
          <Link className="hover:text-white" prefetch href="/explore">
            Salón
          </Link>
          {me?.role === "USER" && (
            <Link className="hover:text-white" prefetch href="/inbox">
              Bandeja
            </Link>
          )}
          {me?.role === "KITTY" && (
            <Link className="hover:text-white" prefetch href="/studio">
              Studio
            </Link>
          )}
          {me?.role === "ADMIN" && (
            <Link className="hover:text-white" prefetch href="/admin">
              Admin
            </Link>
          )}
          {me && (
            <Link className="hover:text-white" prefetch href="/wallet">
              Orbes
            </Link>
          )}
        </nav>
        <div className="flex items-center gap-3">
          {me ? (
            <>
              <span className="hidden rounded-full border border-orchid/30 px-3 py-1 text-xs md:inline">
                {me.displayName} · {me.balance} orbes
              </span>
              <button className="rounded-full border border-orchid/30 px-4 py-2 text-xs hover:bg-white/10" onClick={logout}>
                Salir
              </button>
            </>
          ) : (
            <>
              <Link href="/login" prefetch className="text-sm hover:text-white">
                Entrar
              </Link>
              <Link href="/register" prefetch className="glow-btn px-5 py-2 text-sm">
                Crear cuenta
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
