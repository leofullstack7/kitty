"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useSession } from "./session";

type Invite = {
  id: string;
  roomId: string;
  fromName: string;
  fromSlug: string;
  userName: string;
};

export function IncomingInvites() {
  const { me } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const [invites, setInvites] = useState<Invite[]>([]);
  const [busy, setBusy] = useState("");
  const audioRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    if (me?.role !== "KITTY") return;
    let stop = false;
    async function pull() {
      const res = await fetch("/api/studio/invites", { credentials: "include" });
      if (!res.ok) return;
      const data = await res.json();
      if (!stop) setInvites(data.invites ?? []);
    }
    void pull();
    const t = window.setInterval(() => void pull(), 3500);
    return () => {
      stop = true;
      window.clearInterval(t);
    };
  }, [me?.role]);

  useEffect(() => {
    if (invites.length === 0) return;
    try {
      audioRef.current ??= new AudioContext();
      const ctx = audioRef.current;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = 440;
      gain.gain.value = 0.04;
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.35);
    } catch {
      /* silencios del navegador */
    }
  }, [invites.length]);

  if (me?.role !== "KITTY" || invites.length === 0) return null;
  if (pathname.startsWith("/call/")) return null;

  async function answer(invite: Invite, status: "ACCEPTED" | "DECLINED") {
    setBusy(invite.id);
    const res = await fetch(`/api/studio/invites/${invite.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    setBusy("");
    if (!res.ok) return;
    if (status === "ACCEPTED") router.push(`/call/${invite.roomId}`);
    setInvites((prev) => prev.filter((i) => i.id !== invite.id));
  }

  return (
    <div className="invite-wall fixed inset-0 z-[95] grid place-items-center p-4">
      <div className="w-full max-w-xl space-y-4">
        <p className="text-center text-xs uppercase tracking-[0.4em] text-magenta">llamada entrante</p>
        <h2 className="text-center font-serif text-4xl md:text-5xl">Te están pidiendo entrar a una noche</h2>
        <p className="text-center text-sm text-orchid/80">
          Si hay varias, elige a cuál entrar. Si entras, pasas a ocupada.
        </p>
        {invites.map((inv) => (
          <div key={inv.id} className="glass rounded-3xl p-5">
            <p className="font-serif text-3xl">{inv.fromName}</p>
            <p className="mt-1 text-sm text-orchid/75">está con {inv.userName} y te quiere en la misma sala.</p>
            <div className="mt-5 grid gap-3 md:grid-cols-2">
              <button className="glow-btn propose-pulse py-3" disabled={busy === inv.id} onClick={() => void answer(inv, "ACCEPTED")}>
                Entrar ahora
              </button>
              <button className="rounded-full border border-orchid/35 py-3" disabled={!!busy} onClick={() => void answer(inv, "DECLINED")}>
                No esta vez
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
