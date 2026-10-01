"use client";

import { ACTIVITY_SUGGESTIONS, ORBE_PACKS, ORB_COP_VALUE } from "@/lib/constants";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "./session";

type Media = { id: string; type: string; webPath: string; mobilePath: string | null; desktopPath: string | null; posterPath: string | null };
type Bonus = { id: string; percent: number; code: string; expiresAt: string };

export function KittyProfileClient({
  kitty,
}: {
  kitty: {
    id: string;
    slug: string;
    displayName: string;
    tagline: string;
    bio: string;
    city: string;
    ageLabel: string;
    tags: string[];
    isAvailable: boolean;
    busy?: boolean;
    featured: boolean;
    avatarPath: string;
    coverPath: string;
    media: Media[];
  };
}) {
  const { me } = useSession();
  const router = useRouter();
  const canJoin = me?.role === "USER";
  const [bonuses, setBonuses] = useState<Bonus[]>([]);
  const [open, setOpen] = useState(false);
  const [activity, setActivity] = useState(ACTIVITY_SUGGESTIONS[0]!);
  const [orbes, setOrbes] = useState(20);
  const [bonusId, setBonusId] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!canJoin) {
      setBonuses([]);
      setBonusId("");
      return;
    }
    let cancelled = false;
    fetch(`/api/bonuses?kittyId=${encodeURIComponent(kitty.id)}`, { credentials: "include" })
      .then((res) => (res.ok ? res.json() : { bonuses: [] }))
      .then((data) => {
        if (cancelled) return;
        const next = (data.bonuses ?? []) as Bonus[];
        setBonuses(next);
        setBonusId(next[0]?.id ?? "");
      })
      .catch(() => {
        if (!cancelled) setBonuses([]);
      });
    return () => {
      cancelled = true;
    };
  }, [canJoin, kitty.id]);

  async function sendJoin() {
    setBusy(true);
    setMsg("");
    const res = await fetch("/api/proposals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kittyId: kitty.id, activity, orbes, bonusId: bonusId || null }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setMsg(data.error ?? "No se pudo enviar");
      return;
    }
    setOpen(false);
    router.push("/inbox");
  }

  return (
    <div className="mx-auto max-w-6xl px-4 pb-24 pt-4">
      <div className="relative overflow-hidden rounded-[2rem]">
        <picture>
          <source media="(max-width: 768px)" srcSet={kitty.coverPath} />
          <img src={kitty.coverPath} alt="" className="h-64 w-full object-cover md:h-80" />
        </picture>
        <div className="absolute inset-0 bg-gradient-to-t from-void to-transparent" />
      </div>
      <div className="-mt-20 grid gap-8 md:grid-cols-[280px_1fr]">
        <div>
          <div className="kitty-card mx-auto w-56 md:w-full">
            <picture>
              <source media="(max-width: 768px)" srcSet={kitty.avatarPath.replace("card.webp", "mobile.webp")} />
              <img src={kitty.avatarPath} alt={kitty.displayName} />
            </picture>
          </div>
        </div>
        <div className="pt-6 md:pt-24">
          <div className="flex flex-wrap items-center gap-3">
            {kitty.busy ? (
              <span className="flex items-center gap-2 text-sm text-amber-300">
                <span className="busy-dot" /> Ocupada en otra noche
              </span>
            ) : kitty.isAvailable ? (
              <span className="flex items-center gap-2 text-sm text-emerald-300">
                <span className="available-dot" /> Disponible para JOIN
              </span>
            ) : (
              <span className="text-sm text-white/50">Fuera de sala · déjale un JOIN igual</span>
            )}
            {kitty.featured && <span className="rounded-full bg-magenta px-3 py-1 text-[10px] uppercase">Ícono de la casa</span>}
          </div>
          <h1 className="font-serif text-6xl">{kitty.displayName}</h1>
          <p className="mt-2 text-lg text-orchid/90">{kitty.tagline}</p>
          <p className="mt-4 max-w-2xl text-sm leading-relaxed text-orchid/75">{kitty.bio}</p>
          <p className="mt-3 text-xs uppercase tracking-[0.3em] text-white/50">
            {kitty.city} · {kitty.ageLabel} años
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            {kitty.tags.map((t) => (
              <span key={t} className="rounded-full border border-orchid/25 px-3 py-1 text-xs">
                {t}
              </span>
            ))}
          </div>
          {canJoin ? (
            <button className="glow-btn mt-8 px-8 py-3" onClick={() => setOpen(true)}>
              Ofrecer JOIN a {kitty.displayName}
            </button>
          ) : (
            <a href={me ? "/explore" : "/login"} className="glow-btn mt-8 inline-block px-8 py-3">
              {me ? "Solo los users envían JOIN" : "Entra para ofrecer JOIN"}
            </a>
          )}
          {bonuses.length > 0 && (
            <p className="mt-4 text-sm text-magenta">Tienes un bono activo con ella: {bonuses[0]!.percent}% · {bonuses[0]!.code}</p>
          )}
        </div>
      </div>

      <h2 className="mt-16 font-serif text-3xl">Su galería</h2>
      <div className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-3">
        {kitty.media.map((m) => (
          <div key={m.id} className="kitty-card">
            {m.type === "VIDEO" ? (
              <video src={m.webPath} poster={m.posterPath ?? undefined} controls playsInline className="h-full w-full object-cover" />
            ) : (
              <picture>
                <source media="(max-width: 768px)" srcSet={m.mobilePath ?? m.webPath} />
                <img src={m.desktopPath ?? m.webPath} alt="" />
              </picture>
            )}
          </div>
        ))}
      </div>

      {open && (
        <div className="fixed inset-0 z-[90] grid place-items-center bg-black/70 p-4">
          <div className="glass max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-3xl p-6">
            <h3 className="font-serif text-3xl">JOIN con {kitty.displayName}</h3>
            <p className="mt-2 text-sm text-orchid/75">Propón la actividad y cuántos orbes vale. Ella lo verá en su bandeja.</p>
            <label className="mt-4 block text-xs uppercase tracking-widest text-white/50">Actividad</label>
            <textarea className="input-lux mt-2 min-h-24" value={activity} onChange={(e) => setActivity(e.target.value)} />
            <div className="mt-3 flex flex-wrap gap-2">
              {ACTIVITY_SUGGESTIONS.map((s) => (
                <button key={s} type="button" className="rounded-full border border-orchid/20 px-3 py-1 text-left text-[11px] hover:bg-white/10" onClick={() => setActivity(s)}>
                  {s.slice(0, 42)}…
                </button>
              ))}
            </div>
            <label className="mt-4 block text-xs uppercase tracking-widest text-white/50">Orbes</label>
            <div className="mt-2 flex flex-wrap gap-2">
              {ORBE_PACKS.map((p) => (
                <button key={p.orbes} type="button" onClick={() => setOrbes(p.orbes)} className={`rounded-full px-4 py-2 ${orbes === p.orbes ? "bg-magenta" : "border border-orchid/30"}`}>
                  {p.label}
                </button>
              ))}
            </div>
            <input className="input-lux mt-3" type="number" min={1} max={500} value={orbes} onChange={(e) => setOrbes(Number(e.target.value))} />
            <p className="mt-2 text-sm text-orchid/80">
              {orbes} orbes ≈ ${(orbes * ORB_COP_VALUE).toLocaleString("es-CO")} COP
            </p>
            {bonuses.length > 0 && (
              <select className="input-lux mt-3" value={bonusId} onChange={(e) => setBonusId(e.target.value)}>
                <option value="">Sin bono</option>
                {bonuses.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.code} · {b.percent}% off
                  </option>
                ))}
              </select>
            )}
            {msg && <p className="mt-3 text-sm text-rose-300">{msg}</p>}
            <div className="mt-6 flex gap-3">
              <button className="glow-btn flex-1 py-3" disabled={busy} onClick={sendJoin}>
                Enviar JOIN
              </button>
              <button className="flex-1 rounded-full border border-orchid/30" onClick={() => setOpen(false)}>
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
