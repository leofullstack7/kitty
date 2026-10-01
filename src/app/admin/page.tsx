"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Kitty = {
  id: string;
  slug: string;
  displayName: string;
  username: string;
  isAvailable: boolean;
  featured: boolean;
  city: string;
};

type Hero = {
  id: string;
  title: string;
  subtitle: string;
  ctaLabel: string;
  ctaHref: string;
  imageDesktop: string;
  imageMobile: string;
  active: boolean;
  sortOrder: number;
};

type Bonus = {
  id: string;
  percent: number;
  code: string;
  status: string;
  kittyName: string;
  userName: string;
};

export default function AdminPage() {
  const [kittys, setKittys] = useState<Kitty[]>([]);
  const [heroes, setHeroes] = useState<Hero[]>([]);
  const [bonuses, setBonuses] = useState<Bonus[]>([]);
  const [stats, setStats] = useState({ users: 0, kittys: 0, orbes: 0, pendingBonuses: 0 });
  const [form, setForm] = useState({
    username: "",
    password: "",
    displayName: "",
    slug: "",
    tagline: "",
    bio: "",
    city: "Medellín",
    ageLabel: "25",
  });
  const [editId, setEditId] = useState<string | null>(null);
  const [creds, setCreds] = useState<Record<string, { username: string; password: string }>>({});
  const [msg, setMsg] = useState("");

  async function load() {
    const res = await fetch("/api/admin/bootstrap");
    if (!res.ok) return;
    const data = await res.json();
    setKittys(data.kittys ?? []);
    setHeroes(data.heroes ?? []);
    setBonuses(data.bonuses ?? []);
    setStats(data.stats ?? { users: 0, kittys: 0, orbes: 0, pendingBonuses: 0 });
  }
  useEffect(() => {
    load();
  }, []);

  async function saveKitty(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch(editId ? `/api/admin/kittys/${editId}` : "/api/admin/kittys", {
      method: editId ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const data = await res.json();
    setMsg(data.error ?? "Kitty guardada");
    setEditId(null);
    load();
  }

  async function removeKitty(id: string) {
    if (!confirm("Eliminar kitty y su contenido?")) return;
    await fetch(`/api/admin/kittys/${id}`, { method: "DELETE" });
    load();
  }

  async function saveCreds(id: string) {
    const row = creds[id] ?? { username: "", password: "" };
    await fetch(`/api/admin/kittys/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: row.username || undefined, password: row.password || undefined }),
    });
    setCreds((c) => ({ ...c, [id]: { username: row.username, password: "" } }));
    setMsg("Credenciales actualizadas");
    load();
  }

  async function toggleHero(id: string, active: boolean) {
    await fetch(`/api/admin/heroes/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active }),
    });
    load();
  }

  async function decideBonus(id: string, status: "ACTIVE" | "REVOKED") {
    await fetch(`/api/admin/bonuses/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    load();
  }

  return (
    <div className="mx-auto max-w-6xl px-4 pb-24 pt-8">
      <p className="text-xs uppercase tracking-[0.4em] text-magenta">control de la casa</p>
      <h1 className="font-serif text-5xl">Admin Flow</h1>
      <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          ["Users", stats.users],
          ["Kittys", stats.kittys],
          ["Orbes en wallets", stats.orbes],
          ["Bonos en revisión", stats.pendingBonuses],
        ].map(([l, v]) => (
          <div key={String(l)} className="glass rounded-2xl p-4">
            <p className="text-[10px] uppercase tracking-widest text-orchid/70">{l}</p>
            <p className="font-serif text-4xl">{v}</p>
          </div>
        ))}
      </div>

      <section className="mt-12">
        <h2 className="font-serif text-3xl">CRUD Kittys</h2>
        <form onSubmit={saveKitty} className="glass mt-4 grid gap-3 rounded-3xl p-5 md:grid-cols-2">
          <input className="input-lux" placeholder="Usuario" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} />
          <input className="input-lux" placeholder="Contraseña" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
          <input className="input-lux" placeholder="Nombre" value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} />
          <input className="input-lux" placeholder="slug" value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} />
          <input className="input-lux md:col-span-2" placeholder="Tagline" value={form.tagline} onChange={(e) => setForm({ ...form, tagline: e.target.value })} />
          <textarea className="input-lux md:col-span-2" placeholder="Bio" value={form.bio} onChange={(e) => setForm({ ...form, bio: e.target.value })} />
          <input className="input-lux" placeholder="Ciudad" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
          <input className="input-lux" placeholder="Edad visible" value={form.ageLabel} onChange={(e) => setForm({ ...form, ageLabel: e.target.value })} />
          <button className="glow-btn md:col-span-2 py-3">{editId ? "Actualizar" : "Registrar kitty"}</button>
        </form>
        {msg && <p className="mt-3 text-sm text-magenta">{msg}</p>}

        <div className="mt-6 space-y-3">
          {kittys.map((k) => (
            <article key={k.id} className="glass rounded-2xl p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-serif text-2xl">{k.displayName}</p>
                  <p className="text-xs text-orchid/70">
                    @{k.username} · /k/{k.slug} · {k.city} · {k.isAvailable ? "LIVE" : "off"}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Link className="rounded-full border border-orchid/30 px-3 py-1 text-xs" href={`/k/${k.slug}`}>
                    Ver
                  </Link>
                  <button
                    className="rounded-full border border-orchid/30 px-3 py-1 text-xs"
                    onClick={() => {
                      setEditId(k.id);
                      setForm({
                        username: k.username,
                        password: "",
                        displayName: k.displayName,
                        slug: k.slug,
                        tagline: "",
                        bio: "",
                        city: k.city,
                        ageLabel: "25",
                      });
                      setCreds((c) => ({ ...c, [k.id]: { username: k.username, password: "" } }));
                    }}
                  >
                    Editar
                  </button>
                  <button className="rounded-full border border-rose-400/40 px-3 py-1 text-xs text-rose-200" onClick={() => removeKitty(k.id)}>
                    Eliminar
                  </button>
                </div>
              </div>
              <div className="mt-3 grid gap-2 md:grid-cols-3">
                <input
                  className="input-lux"
                  placeholder="Nuevo usuario"
                  value={creds[k.id]?.username ?? k.username}
                  onChange={(e) =>
                    setCreds((c) => ({ ...c, [k.id]: { username: e.target.value, password: c[k.id]?.password ?? "" } }))
                  }
                />
                <input
                  className="input-lux"
                  placeholder="Nueva clave"
                  type="password"
                  value={creds[k.id]?.password ?? ""}
                  onChange={(e) =>
                    setCreds((c) => ({ ...c, [k.id]: { username: c[k.id]?.username ?? k.username, password: e.target.value } }))
                  }
                />
                <button className="rounded-full border border-orchid/30 text-sm" onClick={() => saveCreds(k.id)}>
                  Guardar credenciales
                </button>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="mt-12">
        <h2 className="font-serif text-3xl">Heroes / anuncios</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          {heroes.map((h) => (
            <article key={h.id} className="glass overflow-hidden rounded-3xl">
              <picture>
                <source media="(max-width: 768px)" srcSet={h.imageMobile} />
                <img src={h.imageDesktop} alt={h.title} className="h-40 w-full object-cover" />
              </picture>
              <div className="p-4">
                <p className="font-serif text-2xl">{h.title}</p>
                <p className="text-sm text-orchid/75">{h.subtitle}</p>
                <button className="mt-3 text-xs uppercase tracking-widest" onClick={() => toggleHero(h.id, !h.active)}>
                  {h.active ? "Desactivar" : "Activar"}
                </button>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="mt-12">
        <h2 className="font-serif text-3xl">Bonos · Margen Blindado</h2>
        <p className="mt-2 text-sm text-orchid/70">
          La comisión de la casa se calcula sobre el precio original. El descuento lo absorbe la Kitty. Aprueba los que superan 15%.
        </p>
        <div className="mt-4 space-y-3">
          {bonuses.map((b) => (
            <div key={b.id} className="glass flex flex-wrap items-center justify-between gap-3 rounded-2xl p-4">
              <div>
                <p className="font-semibold">
                  {b.code} · {b.percent}%
                </p>
                <p className="text-xs text-orchid/70">
                  {b.kittyName} → {b.userName} · {b.status}
                </p>
              </div>
              {b.status === "PENDING_APPROVAL" && (
                <div className="flex gap-2">
                  <button className="glow-btn px-4 py-2 text-xs" onClick={() => decideBonus(b.id, "ACTIVE")}>
                    Aprobar
                  </button>
                  <button className="text-xs" onClick={() => decideBonus(b.id, "REVOKED")}>
                    Rechazar
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
