"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { PREVIEW_MINUTES } from "@/lib/constants";

export type RejoinCall = {
  status: string;
  roomId?: string | null;
  phase?: string | null;
  endsAt?: string | null;
  callStatus?: string | null;
};

export function canRejoin(call: RejoinCall) {
  if (call.status !== "ACCEPTED" || !call.roomId) return false;
  if (call.callStatus === "ENDED") return false;
  if (call.phase === "ROOM") return true;
  if (!call.endsAt) return true;
  return new Date(call.endsAt).getTime() > Date.now();
}

function clock(ms: number | null, room: boolean) {
  if (ms == null) return room ? "—" : `${PREVIEW_MINUTES}:00`;
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function CallRejoin({
  roomId,
  phase,
  endsAt,
}: {
  roomId: string;
  phase?: string | null;
  endsAt?: string | null;
}) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const tick = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(tick);
  }, []);

  const room = phase === "ROOM";
  const remaining = endsAt ? new Date(endsAt).getTime() - now : null;
  if (!room && remaining != null && remaining <= 0) return null;

  return (
    <div className="mt-4 flex flex-col items-center rounded-3xl border border-violet-300/30 bg-black/40 px-4 py-4">
      <p className="text-[10px] uppercase tracking-[0.32em] text-violet-200/80">
        {room ? "sala" : `${PREVIEW_MINUTES} minutos para conocerla`}
      </p>
      <span className="call-timer-flame call-timer-flame-card" aria-live="polite">
        {clock(remaining, room)}
      </span>
      <Link href={`/call/${roomId}`} className="glow-btn mt-3 px-5 py-2 text-sm">
        Volver
      </Link>
    </div>
  );
}
