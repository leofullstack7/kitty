import type { Metadata } from "next";
import { Cormorant_Garamond, Outfit } from "next/font/google";
import "./globals.css";
import { AgeGate } from "@/components/age-gate";
import { Navbar } from "@/components/navbar";
import { SessionProvider } from "@/components/session";
import { OrbField } from "@/components/orb-field";
import { MobileDock } from "@/components/mobile-dock";
import { ChunkRecovery } from "@/components/chunk-recovery";
import { IncomingInvites } from "@/components/incoming-invites";

const outfit = Outfit({
  subsets: ["latin"],
  variable: "--font-outfit",
  display: "swap",
});

const cormorant = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  style: ["normal", "italic"],
  variable: "--font-cormorant",
  display: "swap",
});

export const metadata: Metadata = {
  title: "KITTY — Noches privadas en vivo",
  description: "Encuentra Kittys disponibles, ofrece un JOIN y entra a una videollamada privada. 1 orbe = $10.000 COP.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={`${outfit.variable} ${cormorant.variable}`}>
      <body className="relative antialiased">
        <ChunkRecovery />
        <div className="grain" />
        <OrbField />
        <SessionProvider>
          <AgeGate />
          <IncomingInvites />
          <Navbar />
          <main className="relative z-10 pb-24 md:pb-8">{children}</main>
          <MobileDock />
        </SessionProvider>
      </body>
    </html>
  );
}
