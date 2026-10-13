"use client";

import { useEffect, useRef, useState } from "react";

function money(cop: number) {
  return `$${Math.max(0, Math.round(cop)).toLocaleString("es-CO")}`;
}

export function KittyTicker({
  balance,
  earnedCop,
  sentCop,
}: {
  balance: number;
  earnedCop: number;
  sentCop?: number;
}) {
  const [shown, setShown] = useState(earnedCop);
  const [live, setLive] = useState(earnedCop);
  const fromRef = useRef(earnedCop);

  useEffect(() => {
    const from = fromRef.current;
    const to = earnedCop;
    fromRef.current = to;
    setLive(to);
    if (from === to) return;
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / 850);
      setShown(Math.round(from + (to - from) * p));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [earnedCop]);

  useEffect(() => {
    const id = window.setInterval(() => {
      setLive((n) => n);
    }, 900);
    return () => window.clearInterval(id);
  }, []);

  return (
    <span className="kitty-ticker flex flex-col items-end">
      <span className="text-[11px]">
        Orbes · <span className="tabular-nums">{balance}</span>
      </span>
      <span className="kitty-ticker-roll text-[10px] text-orchid/80">
        <span className="tabular-nums">{money(shown || live)}</span> ganados
        {(sentCop ?? 0) > 0 ? ` · ${money(sentCop ?? 0)} enviados` : ""}
      </span>
    </span>
  );
}
