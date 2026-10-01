"use client";

import { useEffect, useState } from "react";

export function AgeGate() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    setOpen(localStorage.getItem("kitty_18") !== "1");
  }, []);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[100] grid place-items-center bg-black/80 p-4">
      <div className="glass max-w-md rounded-3xl p-8 text-center">
        <p className="font-serif text-4xl">+18</p>
        <h2 className="mt-3 font-serif text-3xl">KITTY es solo para adultos</h2>
        <p className="mt-3 text-sm text-orchid/80">
          Videollamadas privadas entre mayores de edad. Al entrar confirmas que tienes 18 años o más y aceptas
          el tratamiento responsable de tu imagen, audio y datos.
        </p>
        <button
          className="glow-btn mt-6 w-full px-6 py-3"
          onClick={() => {
            localStorage.setItem("kitty_18", "1");
            setOpen(false);
          }}
        >
          Tengo 18+ · Entrar
        </button>
      </div>
    </div>
  );
}
