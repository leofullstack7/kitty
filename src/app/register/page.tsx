"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/components/session";
import Link from "next/link";

export default function RegisterPage() {
  const { refresh } = useSession();
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const res = await fetch("/api/auth/register", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password, displayName }),
    });
    const data = await res.json().catch(() => ({ error: "No se pudo crear" }));
    if (!res.ok) {
      setBusy(false);
      setError(data.error ?? "No se pudo crear");
      return;
    }
    await refresh();
    router.replace("/explore");
  }

  return (
    <div className="mx-auto flex min-h-[80vh] max-w-md flex-col justify-center px-4">
      <h1 className="font-serif text-5xl">Crea tu cuenta</h1>
      <p className="mt-2 text-orchid/75">Un nombre. Una clave. Acceso al salón. Las Kittys ya están adentro.</p>
      <form onSubmit={onSubmit} className="glass mt-8 space-y-4 rounded-3xl p-6">
        <input className="input-lux" placeholder="Nombre para mostrar" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
        <input className="input-lux" placeholder="Usuario (sin espacios)" autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} />
        <input className="input-lux" placeholder="Contraseña (mín. 8)" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        {error && <p className="text-sm text-rose-300">{error}</p>}
        <button disabled={busy} className="glow-btn w-full py-3">
          {busy ? "Creando..." : "Unirme a KITTY"}
        </button>
      </form>
      <p className="mt-4 text-center text-sm text-orchid/70">
        ¿Ya tienes cuenta? <Link href="/login" className="text-white underline">Entrar</Link>
      </p>
    </div>
  );
}
