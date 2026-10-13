"use client";

import { EXTEND_MINUTES, EXTEND_ORBES, PREVIEW_MINUTES, ROOM_MINUTES, ROOM_ORBES } from "@/lib/constants";

function clock(ms: number) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function CallTimer({
  phase,
  remainingMs,
  isUser,
  onCreateRoom,
  onMoreTime,
  busy,
}: {
  phase: "PREVIEW" | "ROOM";
  remainingMs: number | null;
  isUser: boolean;
  onCreateRoom: () => void;
  onMoreTime: () => void;
  busy: boolean;
}) {
  const left = remainingMs ?? 0;
  const previewOver = phase === "PREVIEW" && remainingMs != null && left <= 0;
  const urgent = remainingMs != null && left > 0 && left <= (phase === "PREVIEW" ? 30_000 : 30_000);

  if (phase === "PREVIEW") {
    return (
      <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex justify-center px-3 pt-14 md:pt-6">
        <div className={`pointer-events-auto flex max-w-[94%] flex-col items-center gap-3 ${urgent ? "call-timer-urgent" : ""}`}>
          <p className="text-[10px] uppercase tracking-[0.32em] text-violet-200/80">
            {previewOver ? "se acabaron los 5 minutos" : `${PREVIEW_MINUTES} minutos para conocerla`}
          </p>
          <span className="call-timer-flame" aria-live="polite">
            {remainingMs == null ? "5:00" : clock(left)}
          </span>
          {isUser && (
            <button type="button" className="glow-btn px-5 py-3 text-sm" disabled={busy} onClick={onCreateRoom}>
              Crear la sala · {ROOM_ORBES} orbes · {ROOM_MINUTES} min
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex justify-center pt-3 md:pt-4">
      <div className={`pointer-events-auto flex max-w-[92%] flex-col items-center gap-2 ${urgent ? "call-timer-urgent" : ""}`}>
        <div className="call-timer-chip">
          <span className="text-[9px] uppercase tracking-[0.28em] text-white/55">sala</span>
          <span className="font-serif text-2xl leading-none tabular-nums md:text-3xl">
            {remainingMs == null ? "—" : clock(left)}
          </span>
        </div>
        {isUser && (
          <button type="button" className="rounded-full border border-white/25 bg-black/45 px-3 py-1.5 text-[11px]" disabled={busy} onClick={onMoreTime}>
            +{EXTEND_MINUTES} min · {EXTEND_ORBES} orbes
          </button>
        )}
      </div>
    </div>
  );
}
