"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ORBE_PACKS } from "@/lib/constants";
import { useSession } from "@/components/session";
import {
  connectCallChannel,
  type ActivityAsk,
  type CallChannel,
  type ChatLine,
} from "@/lib/call-channel";

type Seat = "USER" | "HOST" | "GUEST";
type Remote = { id: string; name: string; stream: MediaStream };
type Invitee = { id: string; slug: string; displayName: string; avatarPath: string };

function RemoteTile({ stream, name }: { stream: MediaStream; name: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.srcObject = stream;
    el.setAttribute("playsinline", "true");
    void el.play().catch(() => undefined);
  }, [stream]);
  return (
    <div className="relative h-full min-h-[40vh] overflow-hidden bg-black">
      <video ref={ref} autoPlay playsInline className="h-full w-full object-cover" />
      <p className="absolute bottom-3 left-3 rounded-full bg-black/55 px-3 py-1 text-xs">{name}</p>
    </div>
  );
}

function Whisper({ line }: { line: ChatLine }) {
  const orbe = line.kind === "orbe" || line.kind === "activity";
  return (
    <div className={`whisper-card ${orbe ? "whisper-orbe" : ""}`}>
      <p className="text-[10px] uppercase tracking-[0.22em] text-orchid/55">{line.from}</p>
      <p className={orbe ? "mt-1 font-serif text-lg leading-snug text-[#f6e2ff]" : "mt-1 text-sm text-white/85"}>{line.body}</p>
    </div>
  );
}

export function VideoRoom({
  roomId,
  hostName,
  guestName: guestNameProp,
  userName,
  hostUserId,
  guestUserId: guestUserIdProp,
  callerUserId,
  mySeat,
}: {
  roomId: string;
  hostName: string;
  guestName: string | null;
  userName: string;
  hostUserId: string;
  guestUserId: string | null;
  callerUserId: string;
  mySeat: Seat;
}) {
  const { me, refresh } = useSession();
  const router = useRouter();
  const localRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const peersRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const channelRef = useRef<CallChannel | null>(null);
  const namesRef = useRef<Record<string, string>>({});

  const [chat, setChat] = useState<ChatLine[]>([]);
  const [text, setText] = useState("");
  const [chatOpen, setChatOpen] = useState(false);
  const [camError, setCamError] = useState("");
  const [camReady, setCamReady] = useState(false);
  const [remotes, setRemotes] = useState<Remote[]>([]);
  const [bloom, setBloom] = useState<{ id: number; orbes: number } | null>(null);
  const [activity, setActivity] = useState("Quédate un rato más cerca");
  const [orbes, setOrbes] = useState(10);
  const [proposeOpen, setProposeOpen] = useState(false);
  const [pending, setPending] = useState<ActivityAsk | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [invitees, setInvitees] = useState<Invitee[]>([]);
  const [guestName, setGuestName] = useState(guestNameProp);
  const [guestUserId, setGuestUserId] = useState(guestUserIdProp);
  const [tipOpen, setTipOpen] = useState(false);
  const [tipOrbes, setTipOrbes] = useState(5);
  const [note, setNote] = useState("");
  const [sending, setSending] = useState(false);

  const isUser = mySeat === "USER";
  const isHost = mySeat === "HOST";
  const peerLabel = isUser ? hostName : userName;

  namesRef.current = {
    [callerUserId]: userName,
    [hostUserId]: hostName,
    ...(guestUserId ? { [guestUserId]: guestName ?? "Kitty" } : {}),
  };

  const unread = useMemo(() => chat.length, [chat.length]);

  function pushLine(line: ChatLine) {
    setChat((c) => [...c, line].slice(-80));
  }

  function showBloom(amount: number) {
    setBloom({ id: Date.now(), orbes: amount });
    window.setTimeout(() => setBloom(null), 2400);
  }

  useEffect(() => {
    void fetch(`/api/call/${roomId}/feed`, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!data) return;
        setChat(data.events ?? []);
        if (data.pendingActivity) setPending(data.pendingActivity);
        if (data.guest) {
          setGuestName(data.guest.displayName);
          setGuestUserId(data.guest.userId);
        }
      })
      .catch(() => undefined);
  }, [roomId]);

  useEffect(() => {
    if (!me) return;
    const user = me;
    let unmounted = false;

    async function playLocal(next: MediaStream | null) {
      const el = localRef.current;
      if (!el || !next) return;
      el.srcObject = next;
      el.muted = true;
      el.setAttribute("playsinline", "true");
      try {
        await el.play();
      } catch {
        /* toca la pantalla */
      }
    }

    function upsertRemote(id: string, stream: MediaStream) {
      setRemotes((prev) => {
        const rest = prev.filter((r) => r.id !== id);
        return [...rest, { id, name: namesRef.current[id] ?? "Ella", stream }];
      });
    }

    async function ensurePeer(peerId: string) {
      if (!peerId || peerId === user.id || peersRef.current.has(peerId) || !streamRef.current) return;
      const pc = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }] });
      streamRef.current.getTracks().forEach((t) => pc.addTrack(t, streamRef.current!));
      pc.ontrack = (ev) => {
        const remote = ev.streams[0];
        if (remote) upsertRemote(peerId, remote);
      };
      pc.onicecandidate = (ev) => {
        if (ev.candidate) channelRef.current?.sendSignal({ candidate: ev.candidate.toJSON() }, peerId);
      };
      peersRef.current.set(peerId, pc);
    }

    async function makeOffer(peerId: string) {
      const pc = peersRef.current.get(peerId);
      if (!pc || pc.signalingState !== "stable") return;
      if (user.id > peerId) return;
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      channelRef.current?.sendSignal({ sdp: offer }, peerId);
    }

    async function start() {
      try {
        try {
          streamRef.current = await navigator.mediaDevices.getUserMedia({
            audio: true,
            video: { facingMode: "user", width: { ideal: 480 }, height: { ideal: 640 } },
          });
        } catch {
          streamRef.current = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
        }
        if (unmounted) return;
        await playLocal(streamRef.current);
        setCamReady(true);
      } catch {
        setCamError("El celular pide permiso. Toca Permitir en cámara y micrófono, o toca la pantalla negra y vuelve a entrar.");
        return;
      }

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

      try {
        const channel = await connectCallChannel(
          roomId,
          { id: user.id, displayName: user.displayName, role: user.role },
          {
            onPeers: (ids) => {
              void (async () => {
                for (const id of ids) {
                  if (id === user.id) continue;
                  await ensurePeer(id);
                  await makeOffer(id);
                }
              })();
            },
            onSignal: async (data, from) => {
              if (!from) return;
              await ensurePeer(from);
              const pc = peersRef.current.get(from);
              if (!pc) return;
              if (data.sdp) {
                await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
                if (data.sdp.type === "offer") {
                  const answer = await pc.createAnswer();
                  await pc.setLocalDescription(answer);
                  channelRef.current?.sendSignal({ sdp: answer }, from);
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
              if (!unmounted) pushLine({ ...line, kind: line.kind ?? "chat" });
            },
            onOrbeBurst: (line) => {
              if (unmounted) return;
              showBloom(line.orbes);
              pushLine({
                from: line.from,
                role: "USER",
                body: `le ofreció ${line.orbes} orbes a ${hostName} · ${line.activity}`,
                at: line.at,
                kind: "orbe",
                orbes: line.orbes,
                activity: line.activity,
              });
            },
            onActivity: (ask) => {
              if (unmounted) return;
              setPending(ask);
              pushLine({
                from: ask.from,
                role: "USER",
                body: `propone “${ask.activity}” por ${ask.orbes} orbes · esperando a ella`,
                at: Date.now(),
                kind: "activity",
                orbes: ask.orbes,
                activity: ask.activity,
                status: "PENDING",
              });
            },
            onActivityDecision: (decision) => {
              if (unmounted) return;
              setPending(null);
              if (decision.status === "ACCEPTED") showBloom(decision.orbes);
              pushLine({
                from: hostName,
                role: "KITTY",
                body:
                  decision.status === "ACCEPTED"
                    ? `aceptó “${decision.activity}” · ${decision.orbes} orbes`
                    : `declinó “${decision.activity}” · no se descontaron orbes`,
                at: Date.now(),
                kind: "activity",
                orbes: decision.orbes,
                activity: decision.activity,
                status: decision.status,
              });
            },
            onGuestJoined: (guest) => {
              setGuestName(guest.displayName);
              setGuestUserId(guest.userId);
              namesRef.current[guest.userId] = guest.displayName;
              pushLine({
                from: "KITTY",
                role: "SYSTEM",
                body: `${guest.displayName} entró a la noche`,
                at: Date.now(),
                kind: "system",
              });
            },
            onCallEnded: () => {
              if (isHost && guestName) {
                setTipOpen(true);
                return;
              }
              router.push(isUser ? "/inbox" : "/studio");
            },
          },
          socketToken,
        );
        if (unmounted) {
          channel.disconnect();
          return;
        }
        channelRef.current = channel;
        if (mySeat === "GUEST") {
          channel.sendGuestJoined({ displayName: user.displayName, userId: user.id });
        }
      } catch {
        if (!unmounted) setCamError("No se pudo abrir el canal en vivo. Vuelve a entrar.");
      }
    }

    void start();
    return () => {
      unmounted = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      peersRef.current.forEach((pc) => pc.close());
      peersRef.current.clear();
      channelRef.current?.disconnect();
      channelRef.current = null;
    };
  }, [roomId, me?.id, me?.role, me?.displayName, hostName, isHost, isUser, mySeat, guestName, router]);

  async function sendChat(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim() || sending) return;
    setSending(true);
    const body = text.trim();
    const res = await fetch(`/api/call/${roomId}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body }),
    });
    const data = await res.json().catch(() => ({}));
    setSending(false);
    if (!res.ok) {
      setNote(data.error ?? "No se pudo enviar");
      return;
    }
    const line = (data.line ?? {
      from: me?.displayName ?? "tú",
      role: me?.role ?? "USER",
      body,
      at: Date.now(),
      kind: "chat",
    }) as ChatLine;
    pushLine(line);
    channelRef.current?.sendChat(body);
    setText("");
    setNote("");
  }

  async function proposeActivity() {
    if (sending) return;
    setSending(true);
    showBloom(orbes);
    const res = await fetch(`/api/call/${roomId}/activity`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orbes, activity }),
    });
    const data = await res.json().catch(() => ({}));
    setSending(false);
    if (!res.ok) {
      setNote(data.error ?? "No se pudo proponer");
      return;
    }
    const ask = data.activity as ActivityAsk;
    setPending(ask);
    channelRef.current?.sendActivity(ask);
    pushLine({
      from: me?.displayName ?? "tú",
      role: "USER",
      body: `propone “${ask.activity}” por ${ask.orbes} orbes · esperando a ella`,
      at: Date.now(),
      kind: "activity",
      orbes: ask.orbes,
      activity: ask.activity,
      status: "PENDING",
    });
    setProposeOpen(false);
    setNote("");
  }

  async function decideActivity(status: "ACCEPTED" | "REJECTED") {
    if (!pending || sending) return;
    setSending(true);
    const res = await fetch(`/api/call/${roomId}/activity/${pending.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    const data = await res.json().catch(() => ({}));
    setSending(false);
    if (!res.ok) {
      setNote(data.error ?? "No se pudo responder");
      return;
    }
    const decision = { id: pending.id, status, activity: pending.activity, orbes: pending.orbes };
    channelRef.current?.sendActivityDecision(decision);
    if (status === "ACCEPTED") {
      showBloom(pending.orbes);
      channelRef.current?.sendOrbe(pending.orbes, pending.activity);
      await refresh();
    }
    setPending(null);
  }

  async function loadInvitees() {
    const res = await fetch(`/api/call/${roomId}/invite`, { credentials: "include" });
    const data = await res.json().catch(() => ({}));
    setInvitees(data.kittys ?? []);
    setInviteOpen(true);
  }

  async function sendInvite(toKittyId: string) {
    const res = await fetch(`/api/call/${roomId}/invite`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ toKittyId }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setNote(data.error ?? "No se pudo invitar");
      return;
    }
    pushLine({
      from: hostName,
      role: "KITTY",
      body: `invitó a ${data.to} a esta noche`,
      at: Date.now(),
      kind: "system",
    });
    setInviteOpen(false);
  }

  async function finishCall() {
    const res = await fetch(`/api/call/${roomId}/end`, { method: "POST" });
    if (res.ok) channelRef.current?.sendCallEnded();
    router.push(isUser ? "/inbox" : "/studio");
  }

  async function sendTipAndClose() {
    if (tipOrbes > 0) {
      await fetch(`/api/call/${roomId}/tip-guest`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orbes: tipOrbes }),
      });
    }
    setTipOpen(false);
    await finishCall();
  }

  function askClose() {
    if (isHost && guestName) {
      setTipOpen(true);
      return;
    }
    void finishCall();
  }

  const chatPanel = (
    <>
      <div className="hide-scroll flex-1 space-y-2 overflow-y-auto px-4 py-3">
        {chat.length === 0 && (
          <p className="text-sm text-orchid/60">Aquí queda lo que se susurra: mensajes, orbes y lo que ella acepte.</p>
        )}
        {chat.map((l, i) => (
          <Whisper key={`${l.at}-${i}`} line={l} />
        ))}
      </div>
      <form onSubmit={sendChat} className="border-t border-orchid/15 p-3">
        <div className="flex gap-2">
          <input
            className="input-lux text-sm"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Escríbele algo…"
          />
          <button type="submit" className="glow-btn shrink-0 px-4 text-sm" disabled={sending}>
            Enviar
          </button>
        </div>
        {note && <p className="mt-2 text-xs text-rose-300">{note}</p>}
      </form>
    </>
  );

  return (
    <div className="relative mx-auto grid min-h-[calc(100vh-80px)] max-w-[1400px] md:grid-cols-[1fr_380px]">
      <div className="relative min-h-[70vh] overflow-hidden bg-black md:min-h-[calc(100vh-80px)]">
        <div className={`absolute inset-0 ${remotes.length > 1 ? "grid grid-cols-1 md:grid-cols-2" : ""}`}>
          {remotes.length === 0 && (
            <div className="grid h-full place-items-center bg-gradient-to-b from-plum to-void px-6 text-center">
              <div>
                <p className="font-serif text-3xl">Esperando a {peerLabel}…</p>
                <p className="mt-3 text-sm text-orchid/80">
                  {camReady
                    ? "Tu cámara ya está prendida. El recuadro chiquito eres tú."
                    : "Encendiendo tu cámara. Si sale un aviso, toca Permitir."}
                </p>
              </div>
            </div>
          )}
          {remotes.map((r) => (
            <RemoteTile key={r.id} stream={r.stream} name={r.name} />
          ))}
        </div>

        <video
          ref={localRef}
          autoPlay
          muted
          playsInline
          className="absolute right-4 top-4 z-10 h-28 w-20 rounded-2xl border border-orchid/40 object-cover shadow-xl md:h-36 md:w-28"
        />

        {bloom && (
          <div className="pointer-events-none absolute inset-0 z-30 grid place-items-center">
            <div className="orbe-bloom text-center">
              <img src="/media/processed/brand/orbe.webp" alt="" className="mx-auto h-16 w-16 drop-shadow-[0_0_30px_#c084fc]" />
              <p className="font-serif text-7xl text-[#f4d6ff] md:text-8xl">{bloom.orbes}</p>
              <p className="mt-1 text-xs uppercase tracking-[0.35em] text-orchid/80">orbes</p>
            </div>
          </div>
        )}

        {camError && <p className="absolute bottom-40 left-4 right-4 z-20 rounded-2xl bg-black/70 p-3 text-sm">{camError}</p>}

        <div className="absolute inset-x-0 bottom-0 z-20 bg-gradient-to-t from-black via-black/70 to-transparent p-3 md:p-5">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-[10px] uppercase tracking-[0.3em] text-orchid/70">noche privada</p>
              <p className="font-serif text-2xl">
                {hostName}
                {guestName ? ` · ${guestName}` : ""}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {isUser && (
                <button className="glow-btn propose-pulse px-5 py-2 text-sm" onClick={() => setProposeOpen(true)}>
                  Proponer actividad
                </button>
              )}
              {isHost && !guestName && (
                <button className="rounded-full border border-orchid/40 px-4 py-2 text-sm" onClick={() => void loadInvitees()}>
                  Invitar a otra Kitty
                </button>
              )}
              <button className="rounded-full bg-white/10 px-4 py-2 text-sm" onClick={askClose}>
                {isHost ? "Cerrar noche" : "Salir"}
              </button>
            </div>
          </div>
        </div>

        <button
          type="button"
          className="absolute bottom-28 right-4 z-30 grid h-14 w-14 place-items-center rounded-full bg-magenta shadow-[0_0_24px_#ff6ad5] md:hidden"
          onClick={() => setChatOpen(true)}
        >
          <span className="text-lg">💬</span>
          {unread > 0 && (
            <span className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-black text-[10px]">
              {unread}
            </span>
          )}
        </button>
      </div>

      <aside className="room-chat hidden flex-col md:flex">
        <div className="border-b border-orchid/15 px-4 py-3">
          <p className="text-[10px] uppercase tracking-[0.3em] text-orchid/70">la habitación</p>
          <p className="font-serif text-2xl">{hostName}</p>
          <p className="text-xs text-white/50">Mensajes, orbes y lo que ella acepta. Nada de escenario público.</p>
        </div>
        {isUser && (
          <div className="border-b border-orchid/10 px-4 py-3">
            <button className="glow-btn propose-pulse w-full py-3 text-sm" onClick={() => setProposeOpen(true)}>
              Proponer actividad
            </button>
          </div>
        )}
        {chatPanel}
      </aside>

      {chatOpen && (
        <div className="fixed inset-0 z-40 bg-black/55 md:hidden" onClick={() => setChatOpen(false)}>
          <div
            className="room-chat absolute bottom-0 right-0 flex h-[72vh] w-[min(100%,420px)] flex-col rounded-tl-3xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-orchid/15 px-4 py-3">
              <div>
                <p className="text-[10px] uppercase tracking-[0.3em] text-orchid/70">la habitación</p>
                <p className="font-serif text-xl">{hostName}</p>
              </div>
              <button className="text-sm text-orchid" onClick={() => setChatOpen(false)}>
                Cerrar
              </button>
            </div>
            {chatPanel}
          </div>
        </div>
      )}

      {proposeOpen && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/75 p-4">
          <div className="glass w-full max-w-lg rounded-3xl p-6">
            <p className="text-[10px] uppercase tracking-[0.3em] text-magenta">solo ella lo ve</p>
            <h3 className="font-serif text-3xl">Proponerle algo a {hostName}</h3>
            <p className="mt-2 text-sm text-orchid/75">
              Elige los orbes y escribe qué quieres. No se descuenta nada hasta que ella diga que sí.
            </p>
            <label className="mt-4 block text-xs uppercase tracking-widest text-white/50">Actividad</label>
            <textarea className="input-lux mt-2 min-h-24 text-sm" value={activity} onChange={(e) => setActivity(e.target.value)} />
            <div className="mt-4 flex flex-wrap gap-2">
              {ORBE_PACKS.map((p) => (
                <button
                  key={p.orbes}
                  type="button"
                  className={`rounded-full px-4 py-2 text-sm ${orbes === p.orbes ? "glow-btn" : "border border-orchid/30"}`}
                  onClick={() => {
                    setOrbes(p.orbes);
                    showBloom(p.orbes);
                  }}
                >
                  {p.label} orbes
                </button>
              ))}
            </div>
            {note && <p className="mt-3 text-sm text-rose-300">{note}</p>}
            <div className="mt-6 flex gap-3">
              <button className="glow-btn flex-1 py-3" disabled={sending} onClick={() => void proposeActivity()}>
                Enviarle la propuesta
              </button>
              <button className="flex-1 rounded-full border border-orchid/30" onClick={() => setProposeOpen(false)}>
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {pending && isHost && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/80 p-4">
          <div className="glass w-full max-w-2xl rounded-[2rem] p-6 md:p-10">
            <p className="text-[10px] uppercase tracking-[0.35em] text-magenta">propuesta de la noche</p>
            <h3 className="mt-2 font-serif text-4xl md:text-5xl">{pending.from} te pide esto</h3>
            <p className="mt-6 font-serif text-2xl leading-snug text-[#f6e2ff] md:text-3xl">“{pending.activity}”</p>
            <div className="mt-8 flex items-end gap-4">
              <img src="/media/processed/brand/orbe.webp" alt="" className="h-14 w-14" />
              <div>
                <p className="font-serif text-6xl leading-none">{pending.orbes}</p>
                <p className="text-xs uppercase tracking-[0.3em] text-orchid/70">orbes · se descuentan solo si aceptas</p>
              </div>
            </div>
            <div className="mt-10 grid gap-3 md:grid-cols-2">
              <button className="glow-btn py-4 text-lg" disabled={sending} onClick={() => void decideActivity("ACCEPTED")}>
                Sí, lo hago
              </button>
              <button
                className="rounded-full border border-orchid/35 py-4 text-lg"
                disabled={sending}
                onClick={() => void decideActivity("REJECTED")}
              >
                No esta vez
              </button>
            </div>
          </div>
        </div>
      )}

      {inviteOpen && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/75 p-4">
          <div className="glass w-full max-w-lg rounded-3xl p-6">
            <h3 className="font-serif text-3xl">Invitar a otra Kitty</h3>
            <p className="mt-2 text-sm text-orchid/75">Le llega una llamada grande. Si entra, ustedes dos y el user quedan juntos. Los orbes siguen yendo a ti.</p>
            <div className="mt-5 max-h-72 space-y-2 overflow-y-auto">
              {invitees.length === 0 && <p className="text-sm text-white/50">Nadie más está libre ahora.</p>}
              {invitees.map((k) => (
                <button
                  key={k.id}
                  className="flex w-full items-center gap-3 rounded-2xl border border-orchid/15 p-3 text-left hover:bg-white/5"
                  onClick={() => void sendInvite(k.id)}
                >
                  <img src={k.avatarPath} alt="" className="h-12 w-12 rounded-full object-cover" />
                  <div>
                    <p className="font-serif text-xl">{k.displayName}</p>
                    <p className="text-xs text-orchid/60">/{k.slug}</p>
                  </div>
                </button>
              ))}
            </div>
            <button className="mt-4 w-full rounded-full border border-orchid/30 py-3" onClick={() => setInviteOpen(false)}>
              Cerrar
            </button>
          </div>
        </div>
      )}

      {tipOpen && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/80 p-4">
          <div className="glass w-full max-w-lg rounded-3xl p-6 md:p-8">
            <h3 className="font-serif text-3xl">¿Le envías orbes a {guestName}?</h3>
            <p className="mt-2 text-sm text-orchid/75">
              Estuvo en tu noche. Si quieres, le pasas orbes de tu saldo. Si no, cierra sin enviarle nada.
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              {ORBE_PACKS.map((p) => (
                <button
                  key={p.orbes}
                  type="button"
                  className={`rounded-full px-4 py-2 ${tipOrbes === p.orbes ? "glow-btn" : "border border-orchid/30"}`}
                  onClick={() => setTipOrbes(p.orbes)}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <div className="mt-6 grid gap-3 md:grid-cols-2">
              <button className="glow-btn py-3" onClick={() => void sendTipAndClose()}>
                Enviarle {tipOrbes} orbes
              </button>
              <button className="rounded-full border border-orchid/30 py-3" onClick={() => void finishCall()}>
                No esta vez
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
