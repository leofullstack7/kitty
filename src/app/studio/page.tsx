"use client";

import { useEffect, useState } from "react";
import { useSession } from "@/components/session";

type InboxItem = { id: string; activity: string; orbes: number; status: string; user: { displayName: string; username: string }; roomId?: string | null };
type UserOpt = { id: string; username: string; displayName: string };

export default function StudioPage() {
  const { me, refresh } = useSession();
  const [available, setAvailable] = useState(false);
  const [inbox, setInbox] = useState<InboxItem[]>([]);
  const [users, setUsers] = useState<UserOpt[]>([]);
  const [userId, setUserId] = useState("");
  const [percent, setPercent] = useState(10);
  const [note, setNote] = useState("Porque tu JOIN mereció una segunda noche");
  const [msg, setMsg] = useState("");

  async function load() {
    const [p, u, meRes] = await Promise.all([fetch("/api/proposals"), fetch("/api/studio/users"), fetch("/api/auth/me")]);
    if (p.ok) setInbox((await p.json()).proposals);
    if (u.ok) setUsers((await u.json()).users);
    if (meRes.ok) {
      const data = await meRes.json();
      setAvailable(!!data.me?.available);
    }
  }
  useEffect(() => {
    load();
    const tick = setInterval(() => {
      if (document.visibilityState === "visible") load();
    }, 8000);
    return () => clearInterval(tick);
  }, []);

  async function toggle() {
    const next = !available;
    await fetch("/api/studio/availability", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ available: next }),
    });
    setAvailable(next);
    await refresh();
  }

  async function act(id: string, status: "ACCEPTED" | "IGNORED") {
    await fetch(`/api/proposals/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    load();
  }

  async function gift() {
    const res = await fetch("/api/bonuses", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, percent, note }),
    });
    const data = await res.json();
    setMsg(data.error ?? `Bono ${data.bonus?.code ?? ""} listo`);
  }

  async function upload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const fd = new FormData();
    fd.set("file", file);
    const res = await fetch("/api/media", { method: "POST", body: fd });
    const data = await res.json();
    setMsg(data.error ?? "Media procesada a webp/video de casa");
  }

  return (
    <div className="mx-auto max-w-5xl px-4 pb-24 pt-8">
      <p className="text-xs uppercase tracking-[0.4em] text-magenta">studio</p>
      <h1 className="font-serif text-5xl">Hola, {me?.displayName}</h1>
      <div className="mt-6 flex flex-wrap items-center gap-4">
        <button className="glow-btn px-6 py-3" onClick={toggle}>
          {available ? "Estoy disponible" : "Ponerme en línea"}
        </button>
        <a href="/inbox" className="rounded-full border border-orchid/30 px-6 py-3 text-sm">
          Bandeja JOIN
        </a>
      </div>

      <section className="mt-10 grid gap-6 md:grid-cols-2">
        <article className="glass rounded-3xl p-6">
          <h2 className="font-serif text-3xl">Bandeja</h2>
          <div className="mt-4 space-y-3">
            {inbox.slice(0, 6).map((p) => (
              <div key={p.id} className="rounded-2xl border border-orchid/15 p-3">
                <p className="text-sm font-semibold">{p.user.displayName}</p>
                <p className="text-xs text-orchid/75">{p.activity}</p>
                <p className="text-xs">{p.orbes} orbes · {p.status}</p>
                {p.status === "PENDING" && (
                  <div className="mt-2 flex gap-2">
                    <button className="glow-btn px-3 py-1 text-xs" onClick={() => act(p.id, "ACCEPTED")}>Aceptar</button>
                    <button className="text-xs" onClick={() => act(p.id, "IGNORED")}>Ignorar</button>
                  </div>
                )}
                {p.status === "ACCEPTED" && p.roomId && (
                  <a className="mt-2 inline-block text-xs text-magenta" href={`/call/${p.roomId}`}>Entrar</a>
                )}
              </div>
            ))}
          </div>
        </article>
        <article className="glass rounded-3xl p-6">
          <h2 className="font-serif text-3xl">Obsequiar bono</h2>
          <p className="mt-2 text-xs text-orchid/70">
            Solo sirve conmigo. El descuento sale de MI parte. La casa cobra su 28% sobre el precio original (Margen Blindado).
            Más de 15% pasa a aprobación del admin.
          </p>
          <select className="input-lux mt-4" value={userId} onChange={(e) => setUserId(e.target.value)}>
            <option value="">Elegir usuario</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.displayName} (@{u.username})
              </option>
            ))}
          </select>
          <input className="input-lux mt-3" type="number" min={1} max={25} value={percent} onChange={(e) => setPercent(Number(e.target.value))} />
          <input className="input-lux mt-3" value={note} onChange={(e) => setNote(e.target.value)} />
          <button className="glow-btn mt-4 w-full py-3" onClick={gift}>
            Enviar bono
          </button>
        </article>
      </section>

      <article className="glass mt-6 rounded-3xl p-6">
        <h2 className="font-serif text-3xl">Subir foto o video</h2>
        <p className="mt-2 text-sm text-orchid/70">Las imágenes se convierten a WebP (móvil y desktop). Los videos se transcodifican a MP4 web si hay ffmpeg.</p>
        <input className="mt-4 text-sm" type="file" accept="image/jpeg,image/png,image/webp,video/mp4,video/webm" onChange={upload} />
        {msg && <p className="mt-3 text-sm text-magenta">{msg}</p>}
      </article>
    </div>
  );
}
