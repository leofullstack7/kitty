"use client";

import { ORB_COP_VALUE } from "@/lib/constants";
import { useSession } from "@/components/session";
import { useState } from "react";

const PACKS = [
  { orbes: 10, popular: false },
  { orbes: 20, popular: true },
  { orbes: 50, popular: false },
  { orbes: 100, popular: false },
];

const METHODS = [
  { id: "card", name: "Tarjeta bancaria", hint: "Visa, Mastercard, Amex · 3-D Secure" },
  { id: "nequi", name: "Nequi", hint: "Push a tu celular en segundos" },
  { id: "daviplata", name: "Daviplata", hint: "Saldo digital Davivienda" },
  { id: "paypal", name: "PayPal", hint: "Internacional, saldo o tarjeta" },
];

export default function WalletPage() {
  const { me, refresh } = useSession();
  const [orbes, setOrbes] = useState(20);
  const [method, setMethod] = useState("nequi");
  const [phase, setPhase] = useState<"pick" | "checkout" | "done">("pick");
  const [msg, setMsg] = useState("");

  async function pay() {
    const res = await fetch("/api/wallet/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orbes, method }),
    });
    const data = await res.json();
    if (!res.ok) {
      setMsg(data.error ?? "Error");
      return;
    }
    setPhase("done");
    await refresh();
  }

  return (
    <div className="mx-auto max-w-4xl px-4 pb-24 pt-8">
      <p className="text-xs uppercase tracking-[0.4em] text-magenta">billetera</p>
      <h1 className="font-serif text-5xl">Carga orbes. Abre puertas.</h1>
      <p className="mt-3 text-orchid/75">
        Tienes <strong className="text-white">{me?.balance ?? 0}</strong> orbes. 1 orbe = ${ORB_COP_VALUE.toLocaleString("es-CO")} COP.
      </p>
      <p className="mt-2 text-xs text-white/50">Fase 2: pasarelas reales. Hoy la interfaz está lista y el checkout es un sandbox seguro (no cobra).</p>

      <div className="mt-8 grid gap-4 md:grid-cols-4">
        {PACKS.map((p) => (
          <button
            key={p.orbes}
            onClick={() => setOrbes(p.orbes)}
            className={`glass hover-lift rounded-3xl p-5 text-left ${orbes === p.orbes ? "ring-2 ring-magenta" : ""}`}
          >
            <img src="/media/processed/brand/orbe.webp" alt="" className="h-12 w-12" />
            <p className="mt-3 font-serif text-4xl">{p.orbes}</p>
            <p className="text-sm text-orchid/80">${(p.orbes * ORB_COP_VALUE).toLocaleString("es-CO")}</p>
            {p.popular && <p className="mt-2 text-[10px] uppercase tracking-widest text-magenta">La más usada</p>}
          </button>
        ))}
      </div>

      <h2 className="mt-10 font-serif text-3xl">Método verificado</h2>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        {METHODS.map((m) => (
          <button key={m.id} onClick={() => setMethod(m.id)} className={`glass rounded-2xl p-4 text-left ${method === m.id ? "ring-2 ring-orchid" : ""}`}>
            <p className="font-semibold">{m.name}</p>
            <p className="text-xs text-orchid/70">{m.hint}</p>
          </button>
        ))}
      </div>

      {phase === "pick" && (
        <button className="glow-btn mt-8 px-8 py-3" onClick={() => setPhase("checkout")}>
          Continuar · {orbes} orbes
        </button>
      )}

      {phase === "checkout" && (
        <div className="glass mt-8 rounded-3xl p-6">
          <h3 className="font-serif text-2xl">Checkout (interfaz · fase 2)</h3>
          {method === "card" && (
            <div className="mt-4 space-y-3">
              <input className="input-lux" placeholder="Número de tarjeta" />
              <div className="grid grid-cols-2 gap-3">
                <input className="input-lux" placeholder="MM/AA" />
                <input className="input-lux" placeholder="CVV" />
              </div>
              <input className="input-lux" placeholder="Nombre en la tarjeta" />
            </div>
          )}
          {method === "nequi" && <p className="mt-4 text-sm">Se enviará un push a tu Nequi registrado. Confirma en la app.</p>}
          {method === "daviplata" && <p className="mt-4 text-sm">Abriremos Daviplata para autorizar ${(orbes * ORB_COP_VALUE).toLocaleString("es-CO")}.</p>}
          {method === "paypal" && <p className="mt-4 text-sm">Redirección a PayPal Checkout (sandbox en esta fase).</p>}
          {msg && <p className="mt-3 text-rose-300">{msg}</p>}
          <button className="glow-btn mt-6 w-full py-3" onClick={pay}>
            Pagar en sandbox y acreditar orbes
          </button>
        </div>
      )}

      {phase === "done" && (
        <p className="mt-8 font-serif text-3xl text-magenta">Orbes acreditados. El salón ya te está mirando.</p>
      )}
    </div>
  );
}
