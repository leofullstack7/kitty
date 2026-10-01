"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "@/components/session";
import Link from "next/link";

export default function LoginForm() {
  const params = useSearchParams();
  const { refresh } = useSession();
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const res = await fetch("/api/auth/login", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    const data = await res.json().catch(() => ({ error: "No se pudo entrar" }));
    if (!res.ok) {
      setBusy(false);
      setError(data.error ?? "No se pudo entrar");
      return;
    }
    await refresh();
    const raw = params.get("next") || (data.role === "ADMIN" ? "/admin" : data.role === "KITTY" ? "/studio" : "/explore");
    const next = raw.startsWith("/") && !raw.startsWith("//") ? raw : "/explore";
    router.replace(next);
  }

  return (
    <div className="mx-auto flex min-h-[80vh] max-w-md flex-col justify-center px-4">
      <h1 className="font-serif text-5xl">Entra</h1>
      <p className="mt-2 text-orchid/75">Tu usuario. Tu clave. Tu noche.</p>
      <form onSubmit={onSubmit} className="glass mt-8 space-y-4 rounded-3xl p-6">
        <input className="input-lux" placeholder="Usuario" autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} />
        <input className="input-lux" placeholder="Contraseña" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        {error && <p className="text-sm text-rose-300">{error}</p>}
        <button disabled={busy} className="glow-btn w-full py-3">
          {busy ? "Abriendo la casa..." : "Entrar a KITTY"}
        </button>
      </form>
      <p className="mt-4 text-center text-sm text-orchid/70">
        ¿Aún no tienes cuenta? <Link href="/register" className="text-white underline">Regístrate</Link>
      </p>
    </div>
  );
}
