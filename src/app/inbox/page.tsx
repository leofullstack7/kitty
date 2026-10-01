"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSession } from "@/components/session";

type Proposal = {
  id: string;
  activity: string;
  orbes: number;
  userPays: number;
  status: string;
  createdAt: string;
  roomId?: string | null;
  kitty: { displayName: string; slug: string };
  user: { displayName: string };
};

export default function InboxPage() {
  const { me } = useSession();
  const [items, setItems] = useState<Proposal[]>([]);

  async function load() {
    const res = await fetch("/api/proposals");
    if (res.ok) setItems((await res.json()).proposals);
  }
  useEffect(() => {
    load();
    const tick = setInterval(() => {
      if (document.visibilityState === "visible") load();
    }, 8000);
    return () => clearInterval(tick);
  }, []);

  async function act(id: string, status: "ACCEPTED" | "IGNORED") {
    const res = await fetch(`/api/proposals/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.roomId) {
      window.location.href = `/call/${data.roomId}`;
      return;
    }
    load();
  }

  const isKitty = me?.role === "KITTY" || me?.role === "ADMIN";

  return (
    <div className="mx-auto max-w-3xl px-4 pb-24 pt-8">
      <h1 className="font-serif text-5xl">{isKitty ? "Quién quiere entrar" : "Tus JOIN"}</h1>
      <p className="mt-2 text-orchid/75">
        {isKitty ? "Acepta y se abre la habitación. Ignora y el silencio también es una respuesta." : "Si ella acepta, aquí aparece el botón para entrar a la videollamada."}
      </p>
      <div className="mt-8 space-y-4">
        {items.map((p) => (
          <article key={p.id} className="glass rounded-3xl p-5">
            <p className="text-xs uppercase tracking-widest text-magenta">{p.status}</p>
            <h2 className="font-serif text-2xl">
              {isKitty ? p.user.displayName : p.kitty.displayName}
            </h2>
            <p className="mt-2 text-sm text-orchid/85">{p.activity}</p>
            <p className="mt-2 text-sm">
              {p.orbes} orbes · pagas {p.userPays}
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              {isKitty && p.status === "PENDING" && (
                <>
                  <button className="glow-btn px-5 py-2 text-sm" onClick={() => act(p.id, "ACCEPTED")}>
                    Aceptar
                  </button>
                  <button className="rounded-full border border-orchid/30 px-5 py-2 text-sm" onClick={() => act(p.id, "IGNORED")}>
                    Ignorar
                  </button>
                </>
              )}
              {p.status === "ACCEPTED" && p.roomId && (
                <Link href={`/call/${p.roomId}`} className="glow-btn px-5 py-2 text-sm">
                  Entrar a la videollamada
                </Link>
              )}
            </div>
          </article>
        ))}
        {items.length === 0 && <p className="text-orchid/60">Bandeja en silencio. Por ahora.</p>}
      </div>
    </div>
  );
}
