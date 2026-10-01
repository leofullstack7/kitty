"use client";

import { usePathname } from "next/navigation";
import { Navbar } from "./navbar";
import { MobileDock } from "./mobile-dock";

export function AppShell({ children }: { children: React.ReactNode }) {
  const onCall = usePathname().startsWith("/call/");
  return (
    <>
      <Navbar compact={onCall} />
      <main className={onCall ? "relative z-10" : "relative z-10 pb-24 md:pb-8"}>{children}</main>
      {!onCall && <MobileDock />}
    </>
  );
}
