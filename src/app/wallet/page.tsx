"use client";

import { useEffect, useMemo, useState } from "react";
import { useSession } from "@/components/session";
import { COUNTRY_LIST, WORLD_FALLBACK, type PayMethod } from "@/lib/payments";

type Pack = { orbes: number; cop: number; local: number; label: string; copLabel: string };
type Geo = {
  country: string;
  countryName: string;
  currency: string;
  methods: PayMethod[];
  packs: Pack[];
};

const PHONE_METHODS = new Set(["nequi", "daviplata", "yape", "plin", "bizum", "mach"]);
const BANK_METHODS = new Set(["pse", "spei", "bancolombia", "sepa"]);
const CASH_METHODS = new Set(["oxxo", "boleto"]);

export default function WalletPage() {
  const { me, refresh } = useSession();
  const [geo, setGeo] = useState<Geo | null>(null);
  const [country, setCountry] = useState("");
  const [orbes, setOrbes] = useState(20);
  const [method, setMethod] = useState("");
  const [phase, setPhase] = useState<"pick" | "checkout" | "done">("pick");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [card, setCard] = useState({ number: "", exp: "", cvv: "", name: "" });
  const [paid, setPaid] = useState("");

  async function loadCountry(code?: string) {
    const q = code ? `?country=${encodeURIComponent(code)}` : "";
    const res = await fetch(`/api/geo${q}`, { credentials: "include" });
    if (!res.ok) return;
    const data = (await res.json()) as Geo;
    setGeo(data);
    setCountry(data.country);
    setMethod((prev) => (data.methods.some((m) => m.id === prev) ? prev : data.methods[0]?.id ?? ""));
  }

  useEffect(() => {
    void loadCountry();
  }, []);

  const pack = useMemo(() => geo?.packs.find((p) => p.orbes === orbes) ?? geo?.packs[1], [geo, orbes]);
  const selected = geo?.methods.find((m) => m.id === method);
  const localFirst = geo?.methods.filter((m) => m.local) ?? [];
  const world = geo?.methods.filter((m) => !m.local) ?? [];

  async function pay() {
    setBusy(true);
    setMsg("");
    const res = await fetch("/api/wallet/checkout", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orbes, method, country }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setMsg(data.error ?? "No se pudo recargar");
      return;
    }
    setPaid(data.paid ?? pack?.label ?? "");
    setPhase("done");
    await refresh();
  }

  if (me && me.role !== "USER") {
    return (
      <div className="mx-auto max-w-3xl px-4 pb-24 pt-8">
        <p className="text-xs uppercase tracking-[0.4em] text-magenta">billetera</p>
        <h1 className="font-serif text-5xl">Tus orbes</h1>
        <p className="mt-3 text-orchid/75">
          Saldo: <strong className="text-white">{me.balance}</strong>. Las recargas las hacen los invitados.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-4 pb-24 pt-8">
      <p className="text-xs uppercase tracking-[0.4em] text-magenta">recarga</p>
      <h1 className="font-serif text-5xl">Carga orbes. Abre puertas.</h1>
      <p className="mt-3 text-orchid/75">
        Tienes <strong className="text-white">{me?.balance ?? 0}</strong> orbes.
      </p>

      <div className="glass mt-6 flex flex-wrap items-center justify-between gap-3 rounded-3xl p-4">
        <div>
          <p className="text-[10px] uppercase tracking-[0.3em] text-white/50">Te vemos en</p>
          <p className="font-serif text-2xl">{geo?.countryName ?? "Detectando…"}</p>
          <p className="text-xs text-orchid/70">Mostramos solo los pagos de tu país. Puedes cambiarlo.</p>
        </div>
        <select
          className="input-lux max-w-xs"
          value={country}
          onChange={(e) => {
            setPhase("pick");
            void loadCountry(e.target.value);
          }}
        >
          <option value="XX">{WORLD_FALLBACK.name}</option>
          {COUNTRY_LIST.map((c) => (
            <option key={c.code} value={c.code}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      <div className="mt-8 grid gap-4 sm:grid-cols-2 md:grid-cols-5">
        {(geo?.packs ?? []).map((p) => (
          <button
            key={p.orbes}
            onClick={() => {
              setOrbes(p.orbes);
              setPhase("pick");
            }}
            className={`glass hover-lift rounded-3xl p-5 text-left ${orbes === p.orbes ? "ring-2 ring-magenta" : ""}`}
          >
            <img src="/media/processed/brand/orbe.webp" alt="" className="h-10 w-10" />
            <p className="mt-3 font-serif text-4xl">{p.orbes}</p>
            <p className="text-sm text-orchid/90">{p.label}</p>
            {geo?.currency !== "COP" && <p className="text-[11px] text-white/40">{p.copLabel}</p>}
            {p.orbes === 20 && <p className="mt-2 text-[10px] uppercase tracking-widest text-magenta">La más usada</p>}
          </button>
        ))}
      </div>

      {localFirst.length > 0 && (
        <>
          <h2 className="mt-10 font-serif text-3xl">Paga como en {geo?.countryName}</h2>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {localFirst.map((m) => (
              <MethodCard key={m.id} method={m} active={method === m.id} onPick={() => { setMethod(m.id); setPhase("pick"); }} />
            ))}
          </div>
        </>
      )}

      <h2 className="mt-10 font-serif text-3xl">{localFirst.length ? "También internacional" : "Métodos de pago"}</h2>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        {world.map((m) => (
          <MethodCard key={m.id} method={m} active={method === m.id} onPick={() => { setMethod(m.id); setPhase("pick"); }} />
        ))}
      </div>

      {phase === "pick" && (
        <button className="glow-btn mt-8 px-8 py-3" disabled={!method || !pack} onClick={() => setPhase("checkout")}>
          Continuar · {orbes} orbes · {pack?.label}
        </button>
      )}

      {phase === "checkout" && selected && pack && (
        <div className="glass mt-8 rounded-3xl p-6">
          <p className="text-[10px] uppercase tracking-[0.3em] text-magenta">{selected.name} · {geo?.countryName}</p>
          <h3 className="font-serif text-3xl">Pagar {pack.label}</h3>
          <p className="mt-2 text-sm text-orchid/75">{orbes} orbes · {pack.copLabel}</p>

          {(selected.kind === "card" || selected.id === "webpay") && (
            <div className="mt-4 space-y-3">
              <input className="input-lux" placeholder="Número de tarjeta" value={card.number} onChange={(e) => setCard({ ...card, number: e.target.value })} />
              <div className="grid grid-cols-2 gap-3">
                <input className="input-lux" placeholder="MM/AA" value={card.exp} onChange={(e) => setCard({ ...card, exp: e.target.value })} />
                <input className="input-lux" placeholder="CVV" value={card.cvv} onChange={(e) => setCard({ ...card, cvv: e.target.value })} />
              </div>
              <input className="input-lux" placeholder="Nombre en la tarjeta" value={card.name} onChange={(e) => setCard({ ...card, name: e.target.value })} />
            </div>
          )}
          {PHONE_METHODS.has(selected.id) && (
            <input className="input-lux mt-4" placeholder="Celular de la app" value={phone} onChange={(e) => setPhone(e.target.value)} />
          )}
          {BANK_METHODS.has(selected.id) && (
            <p className="mt-4 text-sm text-orchid/80">Te llevamos al banco o a la pasarela para autorizar {pack.label}.</p>
          )}
          {CASH_METHODS.has(selected.id) && (
            <input className="input-lux mt-4" type="email" placeholder="Correo para la referencia de pago" value={email} onChange={(e) => setEmail(e.target.value)} />
          )}
          {selected.kind === "redirect" && (
            <p className="mt-4 text-sm text-orchid/80">Al confirmar, se abre {selected.name} para autorizar el pago.</p>
          )}
          {selected.id === "pix" && <p className="mt-4 text-sm text-orchid/80">Generamos una clave PIX por {pack.label}. Págala y los orbes entran solos.</p>}

          <p className="mt-4 text-xs text-white/40">Modo prueba: no cobra dinero real. Acredita orbes para que pruebes el salón.</p>
          {msg && <p className="mt-3 text-sm text-rose-300">{msg}</p>}
          <div className="mt-6 flex flex-wrap gap-3">
            <button className="glow-btn flex-1 py-3" disabled={busy} onClick={pay}>
              {busy ? "Acreditando…" : `Pagar ${pack.label}`}
            </button>
            <button className="rounded-full border border-orchid/30 px-6" onClick={() => setPhase("pick")}>
              Volver
            </button>
          </div>
        </div>
      )}

      {phase === "done" && (
        <div className="glass mt-8 rounded-3xl p-6">
          <p className="font-serif text-4xl text-magenta">Orbes acreditados</p>
          <p className="mt-2 text-orchid/80">
            +{orbes} orbes{paid ? ` · ${paid}` : ""}. Saldo: {me?.balance ?? 0}. El salón ya te está mirando.
          </p>
          <button className="glow-btn mt-6 px-6 py-3" onClick={() => { setPhase("pick"); setMsg(""); }}>
            Recargar más
          </button>
        </div>
      )}
    </div>
  );
}

function MethodCard({ method, active, onPick }: { method: PayMethod; active: boolean; onPick: () => void }) {
  return (
    <button onClick={onPick} className={`glass rounded-2xl p-4 text-left ${active ? "ring-2 ring-orchid" : ""}`}>
      <div className="flex items-center justify-between gap-3">
        <p className="font-semibold">{method.name}</p>
        <span className="text-[10px] uppercase tracking-widest text-white/40">{method.local ? "Local" : "Global"}</span>
      </div>
      <p className="text-xs text-orchid/70">{method.hint}</p>
    </button>
  );
}
