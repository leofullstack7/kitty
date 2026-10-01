"use client";

import { useEffect, useRef, useState } from "react";
import { ORBE_PACKS } from "@/lib/constants";
import { useSession } from "@/components/session";
import { connectCallChannel, type CallChannel, type ChatLine } from "@/lib/call-channel";

export function VideoRoom({
  roomId,
  peerName,
}: {
  roomId: string;
  peerName: string;
}) {
  const { me, refresh } = useSession();
  const localRef = useRef<HTMLVideoElement>(null);
  const remoteRef = useRef<HTMLVideoElement>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const channelRef = useRef<CallChannel | null>(null);
  const [chat, setChat] = useState<ChatLine[]>([]);
  const [text, setText] = useState("");
  const [bursts, setBursts] = useState<{ id: number; orbes: number; x: number }[]>([]);
  const [camError, setCamError] = useState("");
  const [camReady, setCamReady] = useState(false);
  const [live, setLive] = useState(false);
  const [activity, setActivity] = useState("otra ronda");

  useEffect(() => {
    if (!me) return;
    const user = me;
    let stream: MediaStream | null = null;
    let pc: RTCPeerConnection | null = null;
    let unmounted = false;

    async function playVideo(el: HTMLVideoElement | null, next: MediaStream | null) {
      if (!el || !next) return;
      el.srcObject = next;
      el.muted = el === localRef.current;
      el.setAttribute("playsinline", "true");
      el.setAttribute("webkit-playsinline", "true");
      try {
        await el.play();
      } catch {
        /* el usuario puede tocar la pantalla para arrancar */
      }
    }

    async function start() {
      try {
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            audio: true,
            video: { facingMode: "user", width: { ideal: 480 }, height: { ideal: 640 } },
          });
        } catch {
          stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
        }
        if (unmounted) return;
        await playVideo(localRef.current, stream);
        setCamReady(true);
      } catch {
        setCamError("El celular pide permiso. Toca Permitir en cámara y micrófono, o toca la pantalla negra y vuelve a entrar.");
        return;
      }

      pc = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }] });
      pcRef.current = pc;
      stream.getTracks().forEach((t) => pc!.addTrack(t, stream!));
      pc.ontrack = (ev) => {
        const remote = ev.streams[0] ?? null;
        void playVideo(remoteRef.current, remote);
        setLive(true);
      };

      let socketToken: string | undefined;
      if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
        const tokenRes = await fetch("/api/auth/socket", { credentials: "include" });
        const tokenJson = await tokenRes.json().catch(() => ({}));
        if (!tokenRes.ok || !tokenJson.token) {
          setCamError("No se pudo abrir el canal en vivo. Vuelve a entrar.");
          return;
        }
        socketToken = tokenJson.token as string;
      }

      async function makeOffer() {
            if (user.role !== "USER" || !pc || pc.signalingState !== "stable") return;
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        channelRef.current?.sendSignal({ sdp: offer });
      }

      try {
        const channel = await connectCallChannel(
          roomId,
          { id: user.id, displayName: user.displayName, role: user.role },
          {
            onPeers: (count) => {
              if (count > 1) void makeOffer();
            },
            onSignal: async (data) => {
              if (!pc) return;
              if (data.sdp) {
                await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
                if (data.sdp.type === "offer") {
                  const answer = await pc.createAnswer();
                  await pc.setLocalDescription(answer);
                  channelRef.current?.sendSignal({ sdp: answer });
                }
              }
              if (data.candidate) {
                try {
                  await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
                } catch {
                  /* ignore */
                }
              }
            },
            onChat: (line) => {
              if (!unmounted) setChat((c) => [...c, { ...line, kind: "chat" as const }].slice(-80));
            },
            onOrbeBurst: (line) => {
              if (unmounted) return;
              setChat((c) => [
                ...c,
                { from: line.from, role: "USER", body: `envió ${line.orbes} orbes · ${line.activity}`, at: line.at, kind: "orbe" as const },
              ]);
              setBursts((b) => [...b, { id: line.at, orbes: line.orbes, x: 12 + Math.random() * 70 }].slice(-16));
            },
          },
          socketToken,
        );
        if (unmounted) {
          channel.disconnect();
          return;
        }
        channelRef.current = channel;
        pc.onicecandidate = (ev) => {
          if (ev.candidate) channel.sendSignal({ candidate: ev.candidate.toJSON() });
        };
      } catch {
        if (!unmounted) setCamError("No se pudo abrir el canal en vivo. Vuelve a entrar.");
      }
    }

    void start();
    return () => {
      unmounted = true;
      stream?.getTracks().forEach((t) => t.stop());
      pc?.close();
      channelRef.current?.disconnect();
      channelRef.current = null;
    };
  }, [roomId, me?.id, me?.role, me?.displayName]);

  async function sendChat(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    const body = text.trim();
    channelRef.current?.sendChat(body);
    if (process.env.NEXT_PUBLIC_SUPABASE_URL) {
      setChat((c) => [...c, { from: me?.displayName ?? "tú", role: me?.role ?? "USER", body, at: Date.now(), kind: "chat" }]);
    }
    setText("");
  }

  async function sendOrbes(orbes: number) {
    const res = await fetch(`/api/call/${roomId}/orbes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orbes, activity }),
    });
    if (!res.ok) {
      const data = await res.json();
      setChat((c) => [...c, { from: "KITTY", role: "SYSTEM", body: data.error ?? "No se pudo enviar", at: Date.now(), kind: "chat" }]);
      return;
    }
    channelRef.current?.sendOrbe(orbes, activity);
    await refresh();
  }

  return (
    <div className="relative mx-auto grid min-h-[calc(100vh-80px)] max-w-[1400px] md:grid-cols-[1fr_360px]">
      <div className="relative min-h-[70vh] overflow-hidden bg-black md:min-h-[calc(100vh-80px)]">
        <video ref={remoteRef} autoPlay playsInline className="absolute inset-0 h-full w-full object-cover" />
        {!live && (
          <div className="absolute inset-0 grid place-items-center bg-gradient-to-b from-plum to-void px-6 text-center">
            <div>
              <p className="font-serif text-3xl">Esperando a {peerName}…</p>
              <p className="mt-3 text-sm text-orchid/80">
                {camReady
                  ? "Tu cámara ya está prendida. El recuadro chiquito de arriba a la derecha eres tú. Espera a que se vea la otra persona."
                  : "Encendiendo tu cámara. Si sale un aviso, toca Permitir. Si la pantalla está negra, tócala una vez."}
              </p>
            </div>
          </div>
        )}
        <video
          ref={localRef}
          autoPlay
          muted
          playsInline
          className="absolute right-4 top-4 z-10 h-28 w-20 rounded-2xl border border-orchid/40 object-cover shadow-xl md:h-36 md:w-28"
        />
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          {bursts.map((b) => (
            <span
              key={b.id}
              className="absolute bottom-24 flex flex-col items-center"
              style={{ left: `${b.x}%`, animation: "rise 3.8s ease-out forwards" }}
            >
              <img src="/media/processed/brand/orbe.webp" alt="" className="h-10 w-10 drop-shadow-[0_0_18px_#a855f7]" />
              <span className="font-serif text-lg text-orchid">+{b.orbes}</span>
            </span>
          ))}
        </div>
        {camError && <p className="absolute bottom-40 left-4 right-4 z-20 rounded-2xl bg-black/70 p-3 text-sm">{camError}</p>}

        <div className="absolute inset-x-0 bottom-0 z-20 bg-gradient-to-t from-black via-black/70 to-transparent p-3 md:p-5">
          {me?.role === "USER" && (
            <>
              <input
                className="input-lux mb-3 text-sm"
                placeholder="Actividad extra para estos orbes"
                value={activity}
                onChange={(e) => setActivity(e.target.value)}
              />
              <div className="flex flex-wrap justify-center gap-2">
                {ORBE_PACKS.map((p) => (
                  <button key={p.orbes} className="glow-btn px-4 py-2 text-sm" onClick={() => sendOrbes(p.orbes)}>
                    <span className="mr-1">{p.label}</span>
                    <span className="text-[10px] opacity-80">orbes</span>
                  </button>
                ))}
              </div>
            </>
          )}
          {me?.role === "KITTY" && (
            <p className="text-center font-serif text-2xl text-orchid">Cuando lleguen orbes, explotan aquí. No apartes la mirada.</p>
          )}
        </div>

        <div className="absolute bottom-36 left-3 right-3 z-20 space-y-1 md:hidden">
          {chat.slice(-4).map((l, i) => (
            <p key={i} className={`text-sm drop-shadow ${l.kind === "orbe" ? "font-serif text-lg text-magenta" : "text-white"}`}>
              <strong>{l.from}: </strong>
              {l.body}
            </p>
          ))}
        </div>
      </div>

      <aside className="twitch-chat hidden flex-col md:flex">
        <div className="border-b border-orchid/15 px-4 py-3">
          <p className="text-[10px] uppercase tracking-[0.3em] text-magenta">stream chat</p>
          <p className="font-serif text-2xl">{peerName}</p>
        </div>
        <div className="hide-scroll flex-1 space-y-2 overflow-y-auto px-4 py-3">
          {chat.map((l, i) => (
            <p key={i} className="text-sm leading-snug">
              <span className={l.role === "KITTY" ? "text-magenta" : "text-orchid"}>{l.from}</span>{" "}
              <span className={l.kind === "orbe" ? "font-semibold text-white" : "text-white/80"}>{l.body}</span>
            </p>
          ))}
        </div>
        <form onSubmit={sendChat} className="border-t border-orchid/15 p-3">
          <input className="input-lux text-sm" value={text} onChange={(e) => setText(e.target.value)} placeholder="Enviar mensaje..." />
        </form>
      </aside>

      <form onSubmit={sendChat} className="fixed bottom-0 left-0 right-0 z-30 p-3 md:hidden">
        <input className="input-lux text-sm" value={text} onChange={(e) => setText(e.target.value)} placeholder="Chat en vivo..." />
      </form>
    </div>
  );
}
