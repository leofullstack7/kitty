"use client";

import Link from "next/link";
import { useSession } from "./session";

export function MobileDock() {
  const { me } = useSession();
  if (!me) return null;
  const items =
    me.role === "ADMIN"
      ? [
          ["/explore", "Salón"],
          ["/admin", "Admin"],
          ["/wallet", "Orbes"],
        ]
      : me.role === "KITTY"
        ? [
            ["/studio", "Studio"],
            ["/inbox", "JOIN"],
            ["/explore", "Salón"],
          ]
        : [
            ["/explore", "Salón"],
            ["/inbox", "JOIN"],
            ["/wallet", "Orbes"],
          ];
  return (
    <nav className="fixed inset-x-3 bottom-3 z-50 grid grid-cols-3 gap-2 rounded-full border border-orchid/25 bg-black/70 p-2 backdrop-blur-xl md:hidden">
      {items.map(([href, label]) => (
        <Link key={href} href={href} prefetch className="rounded-full py-2 text-center text-[11px] uppercase tracking-widest hover:bg-white/10">
          {label}
        </Link>
      ))}
    </nav>
  );
}
