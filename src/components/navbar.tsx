"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { clearSessionCache, useSession } from "./session";

function money(cop?: number) {
  const n = Math.max(0, Math.round(cop ?? 0));
  return `$${n.toLocaleString("es-CO")}`;
}

export function Navbar({ compact = false }: { compact?: boolean }) {
  const { me, refresh } = useSession();
  const router = useRouter();

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
    clearSessionCache();
    await refresh();
    router.replace("/");
  }

  return (
    <header className={`sticky top-0 z-50 ${compact ? "bg-black/70 backdrop-blur-md" : ""}`}>
      <div className={`mx-auto flex max-w-7xl items-center justify-between px-4 ${compact ? "py-2" : "py-4"}`}>
        <Link href={compact ? "#" : "/"} prefetch={!compact} className="flex items-center gap-3 hover-lift">
          <img src="/media/brand/logo-kitty.png" alt="KITTY" className={`${compact ? "h-8 w-8" : "h-10 w-10"} rounded-full object-cover shadow-[0_0_24px_#a855f7]`} />
          <div className={compact ? "hidden sm:block" : ""}>
            <p className="font-serif text-2xl leading-none tracking-[0.2em]">KITTY</p>
            {!compact && <p className="text-[10px] uppercase tracking-[0.35em] text-orchid/70">private rooms</p>}
          </div>
        </Link>
        <nav className={`hidden items-center gap-6 text-sm text-orchid/80 ${compact ? "" : "md:flex"}`}>
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
        </nav>
        <div className="flex items-center gap-2 sm:gap-3">
          {me ? (
            <>
              {me.role === "USER" && (
                <Link href="/wallet" prefetch className="glow-btn flex flex-col items-start px-3 py-1.5 leading-tight sm:px-4">
                  <span className="text-[11px] sm:text-sm">
                    Comprar orbes <span className="opacity-80">· {me.balance}</span>
                  </span>
                  <span className="text-[10px] font-normal tracking-wide opacity-85">
                    {money(me.investedCop)} cargados · {money(me.spentCop)} gastados
                  </span>
                </Link>
              )}
              {me.role === "KITTY" && (
                <Link href="/wallet" prefetch className="flex flex-col items-end rounded-2xl border border-orchid/30 px-3 py-1.5 leading-tight hover:bg-white/10">
                  <span className="text-[11px]">Orbes · {me.balance}</span>
                  <span className="text-[10px] text-orchid/80">
                    {money(me.earnedCop)} ganados
                    {(me.sentCop ?? 0) > 0 ? ` · ${money(me.sentCop)} enviados` : ""}
                  </span>
                </Link>
              )}
              {me.role === "ADMIN" && (
                <Link href="/wallet" prefetch className="rounded-full border border-orchid/30 px-3 py-2 text-[11px] hover:bg-white/10">
                  Orbes · {me.balance}
                </Link>
              )}
              {!compact && (
                <button className="rounded-full border border-orchid/30 px-3 py-2 text-[11px] hover:bg-white/10 sm:px-4 sm:text-xs" onClick={logout}>
                  Salir
                </button>
              )}
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
