"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/components/session";
import Link from "next/link";

const CITIES = ["Medellín", "Bogotá", "Cali", "Cartagena", "Barranquilla", "Pereira", "Bucaramanga"];

function slugify(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9_]+/g, "")
    .slice(0, 20);
}

export default function KittyRegisterPage() {
  const { refresh } = useSession();
  const router = useRouter();
  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [userTouched, setUserTouched] = useState(false);
  const [password, setPassword] = useState("");
  const [tagline, setTagline] = useState("");
  const [bio, setBio] = useState("");
  const [city, setCity] = useState("Medellín");
  const [ageLabel, setAgeLabel] = useState("25");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const handle = useMemo(() => (userTouched ? slugify(username) : slugify(displayName)), [userTouched, username, displayName]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const name = displayName.trim();
    const user = handle;
    if (name.length < 2) {
      setError("Escribe el nombre con el que te van a ver.");
      return;
    }
    if (user.length < 3) {
      setError("El usuario necesita al menos 3 letras o números, sin espacios.");
      return;
    }
    if (password.length < 8) {
      setError("La clave tiene que tener mínimo 8 caracteres.");
      return;
    }

    setBusy(true);
    setError("");
    const res = await fetch("/api/auth/register-kitty", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        displayName: name,
        username: user,
        password,
        slug: user,
        tagline: tagline.trim(),
        bio: bio.trim(),
        city,
        ageLabel,
      }),
    });
    const data = await res.json().catch(() => ({ error: "No se pudo crear tu perfil" }));
    if (!res.ok) {
      setBusy(false);
      setError(data.error ?? "No se pudo crear tu perfil");
      return;
    }
    await refresh();
    router.replace("/studio");
  }

  return (
    <div className="mx-auto max-w-5xl px-4 pb-24 pt-8">
      <p className="text-[10px] uppercase tracking-[0.4em] text-magenta">solo kittys</p>
      <h1 className="font-serif text-5xl md:text-6xl">Pide tu lugar en la casa</h1>
      <p className="mt-3 max-w-2xl text-orchid/75">
        Con nombre, usuario y clave ya puedes entrar. Lo demás lo puedes completar ahora o después en el studio.
      </p>

      <div className="mt-10 grid gap-8 md:grid-cols-[1.1fr_.9fr]">
        <form onSubmit={onSubmit} className="glass space-y-4 rounded-[2rem] p-6 md:p-8">
          <label className="block">
            <span className="mb-2 block text-[10px] uppercase tracking-[0.25em] text-white/45">Cómo te ven *</span>
            <input
              className="input-lux"
              placeholder="Tu nombre en el salón"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
            />
          </label>
          <label className="block">
            <span className="mb-2 block text-[10px] uppercase tracking-[0.25em] text-white/45">Usuario para entrar *</span>
            <input
              className="input-lux"
              placeholder="ej. luna_roja"
              autoComplete="username"
              value={handle}
              onChange={(e) => {
                setUserTouched(true);
                setUsername(slugify(e.target.value));
              }}
            />
            <span className="mt-2 block text-xs text-orchid/60">Sin espacios. Tu perfil: /k/{handle || "tu-usuario"}</span>
          </label>
          <label className="block">
            <span className="mb-2 block text-[10px] uppercase tracking-[0.25em] text-white/45">Clave (mín. 8) *</span>
            <input
              className="input-lux"
              placeholder="Mínimo 8 caracteres"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          <label className="block">
            <span className="mb-2 block text-[10px] uppercase tracking-[0.25em] text-white/45">Una frase (opcional)</span>
            <input className="input-lux" placeholder="Cómo quieres que te recuerden" value={tagline} onChange={(e) => setTagline(e.target.value)} />
          </label>
          <label className="block">
            <span className="mb-2 block text-[10px] uppercase tracking-[0.25em] text-white/45">Quién eres (opcional)</span>
            <textarea className="input-lux min-h-24" placeholder="Lo puedes escribir después" value={bio} onChange={(e) => setBio(e.target.value)} />
          </label>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="block">
              <span className="mb-2 block text-[10px] uppercase tracking-[0.25em] text-white/45">Ciudad</span>
              <select className="input-lux" value={city} onChange={(e) => setCity(e.target.value)}>
                {CITIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-2 block text-[10px] uppercase tracking-[0.25em] text-white/45">Edad visible (21+)</span>
              <input className="input-lux" type="number" min={21} max={65} value={ageLabel} onChange={(e) => setAgeLabel(e.target.value)} />
            </label>
          </div>
          {error && <p className="rounded-2xl bg-rose-500/15 p-3 text-sm text-rose-200">{error}</p>}
          <button disabled={busy} className="glow-btn w-full py-3">
            {busy ? "Abriendo tu studio..." : "Quiero ser Kitty"}
          </button>
        </form>

        <aside className="space-y-5">
          <div className="glass rounded-[2rem] p-6">
            <p className="text-[10px] uppercase tracking-[0.3em] text-magenta">después del registro</p>
            <h2 className="mt-2 font-serif text-3xl">Entras al studio</h2>
            <ul className="mt-4 space-y-3 text-sm text-orchid/80">
              <li>Te pones disponible cuando quieras recibir JOIN.</li>
              <li>Subes tu foto y tu galería desde el studio.</li>
              <li>Aceptas o ignoras. Una noche a la vez.</li>
              <li>Para volver, usas el mismo login que todos.</li>
            </ul>
          </div>
          <div className="rounded-[2rem] border border-orchid/15 p-6 text-sm text-orchid/70">
            <p>¿Solo quieres ver el salón y mandar JOIN?</p>
            <Link href="/register" className="mt-2 inline-block text-white underline">
              Crea una cuenta de user
            </Link>
          </div>
          <p className="text-center text-sm text-orchid/70">
            ¿Ya tienes perfil?{" "}
            <Link href="/login" className="text-white underline">
              Entra aquí
            </Link>
          </p>
        </aside>
      </div>
    </div>
  );
}
