"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { EXTEND_MINUTES, EXTEND_ORBES, ORBE_PACKS, ROOM_MINUTES, ROOM_ORBES } from "@/lib/constants";
import { useSession } from "@/components/session";
import { CallTimer } from "@/components/call-timer";
import { CallMediaDock } from "@/components/call-media-dock";
import {
  connectCallChannel,
  type ActivityAsk,
  type CallChannel,
  type ChatLine,
} from "@/lib/call-channel";
import {
  applySendQuality,
  defaultIceServers,
  getCallMedia,
  isLiveIce,
  isStuckPeer,
  nextRung,
  readLinkHealth,
  rtcConfig,
  shouldOffer,
  syncPeerTracks,
} from "@/lib/webrtc";
import type { SignalData } from "@/lib/call-channel";
import { armCallBackground, dropHeld, holdCall, signalKey, takeHeld } from "@/lib/call-persist";

type Seat = "USER" | "HOST" | "GUEST";
type Remote = { id: string; name: string; stream: MediaStream };
type Invitee = { id: string; slug: string; displayName: string; avatarPath: string };
type MenuTip = { id: string; title: string; orbes: number };

function RemoteTile({ stream, name }: { stream: MediaStream; name: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [blocked, setBlocked] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.srcObject = stream;
    el.muted = true;
    el.playsInline = true;
    el.setAttribute("playsinline", "true");
    el.setAttribute("webkit-playsinline", "true");
    const start = () => {
      void el
        .play()
        .then(() => {
          el.muted = false;
          return el.play();
        })
        .then(() => setBlocked(false))
        .catch(() => setBlocked(true));
    };
    if (el.readyState >= 1) start();
    else el.onloadedmetadata = start;
    return () => {
      el.onloadedmetadata = null;
    };
  }, [stream]);

  function unlock() {
    const el = ref.current;
    if (!el) return;
    el.muted = false;
    void el.play().then(() => setBlocked(false)).catch(() => setBlocked(true));
  }

  return (
    <div className="relative h-full min-h-[40vh] overflow-hidden bg-black" onClick={unlock}>
      <video ref={ref} autoPlay playsInline muted className="h-full w-full object-cover" style={{ objectFit: "cover" }} />
      {blocked && (
        <button type="button" className="absolute inset-0 z-10 grid place-items-center bg-black/45 text-sm" onClick={unlock}>
          Toca para verla y oírla
        </button>
      )}
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
  phase: phaseProp,
  endsAt: endsAtProp,
}: {
  roomId: string;
  hostName: string;
  guestName: string | null;
  userName: string;
  hostUserId: string;
  guestUserId: string | null;
  callerUserId: string;
  mySeat: Seat;
  phase: "PREVIEW" | "ROOM";
  endsAt: string | null;
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
  const [menuTips, setMenuTips] = useState<MenuTip[]>([]);
  const [pending, setPending] = useState<ActivityAsk | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [invitees, setInvitees] = useState<Invitee[]>([]);
  const [guestName, setGuestName] = useState(guestNameProp);
  const [guestUserId, setGuestUserId] = useState(guestUserIdProp);
  const [joiningName, setJoiningName] = useState<string | null>(null);
  const [tipOpen, setTipOpen] = useState(false);
  const [tipOrbes, setTipOrbes] = useState(5);
  const [note, setNote] = useState("");
  const [sending, setSending] = useState(false);
  const [phase, setPhase] = useState<"PREVIEW" | "ROOM">(phaseProp);
  const [endsAt, setEndsAt] = useState<string | null>(endsAtProp);
  const [nowTick, setNowTick] = useState(Date.now());
  const [mirrored, setMirrored] = useState(true);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const closingRef = useRef(false);
  const [linkHint, setLinkHint] = useState("");
  const iceServersRef = useRef<RTCIceServer[]>(defaultIceServers());
  const pendingIceRef = useRef<Map<string, RTCIceCandidateInit[]>>(new Map());
  const missingPeersRef = useRef<Map<string, number>>(new Map());
  const qualityRungRef = useRef(2);
  const makingOfferRef = useRef<Set<string>>(new Set());
  const peerBornRef = useRef<Map<string, number>>(new Map());
  const seenSignalsRef = useRef<Set<string>>(new Set());
  const mediaReadySent = useRef(false);
  const guestUserIdRef = useRef(guestUserIdProp);
  guestUserIdRef.current = guestUserId;
  const guestNameRef = useRef(guestNameProp);
  guestNameRef.current = guestName;
  const hostUserIdRef = useRef(hostUserId);
  hostUserIdRef.current = hostUserId;
  const callerUserIdRef = useRef(callerUserId);
  callerUserIdRef.current = callerUserId;

  const isUser = mySeat === "USER";
  const isHost = mySeat === "HOST";
  const isKittySeat = mySeat === "HOST" || mySeat === "GUEST";
  const hasGuest = Boolean(guestUserId);
  const canKick = isHost && (hasGuest || !!joiningName);
  const canInvite = isKittySeat;
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
        if (data.guest?.live) {
          setGuestName(data.guest.displayName);
          setGuestUserId(data.guest.userId);
          setJoiningName(null);
        } else {
          setGuestName(null);
          setGuestUserId(null);
          setJoiningName(data.guest?.displayName ?? null);
        }
        if (data.phase === "PREVIEW" || data.phase === "ROOM") setPhase(data.phase);
        if (data.endsAt !== undefined) setEndsAt(data.endsAt);
        if (data.status === "ENDED") {
          router.push(isUser ? "/inbox" : "/studio");
        }
      })
      .catch(() => undefined);
  }, [roomId, isUser, router]);

  useEffect(() => {
    let stop = false;
    async function beat() {
      const res = await fetch(`/api/call/${roomId}/presence`, { method: "POST", credentials: "include" });
      const data = await res.json().catch(() => ({}));
      if (stop) return;
      if (data.kicked || res.status === 410) {
        router.push(mySeat === "USER" ? "/inbox" : "/studio");
        return;
      }
      if (data.phase === "PREVIEW" || data.phase === "ROOM") setPhase(data.phase);
      if (data.endsAt) setEndsAt(data.endsAt);
      if (!data.guestId) {
        setGuestName(null);
        setGuestUserId(null);
        setJoiningName(null);
      } else if (data.guestLive) {
        setJoiningName(null);
      }
    }
    function pingHidden() {
      void fetch(`/api/call/${roomId}/presence`, { method: "POST", credentials: "include", keepalive: true });
    }
    function onVisibility() {
      if (document.visibilityState === "hidden") pingHidden();
      else void beat();
    }
    void beat();
    const t = window.setInterval(() => void beat(), 4000);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", pingHidden);
    return () => {
      stop = true;
      window.clearInterval(t);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", pingHidden);
    };
  }, [roomId, mySeat, router]);

  useEffect(() => {
    const t = window.setInterval(() => setNowTick(Date.now()), 250);
    return () => window.clearInterval(t);
  }, []);

  useEffect(() => {
    if (!isUser) return;
    void fetch(`/api/call/${roomId}/tips`, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : { tips: [] }))
      .then((data) => setMenuTips(data.tips ?? []))
      .catch(() => undefined);
  }, [roomId, isUser]);

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

    async function flushIce(peerId: string, pc: RTCPeerConnection) {
      const queued = pendingIceRef.current.get(peerId) ?? [];
      pendingIceRef.current.delete(peerId);
      for (const candidate of queued) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(candidate));
        } catch {
          /* el par aún no está listo */
        }
      }
    }

    async function tuneAll() {
      const count = Math.max(1, peersRef.current.size);
      for (const pc of peersRef.current.values()) {
        const health = await readLinkHealth(pc).catch(() => ({ rtt: 0, lossRate: 0, nack: 0 }));
        qualityRungRef.current = nextRung(qualityRungRef.current, health);
        await applySendQuality(pc, count, qualityRungRef.current);
      }
      const live = [...peersRef.current.values()].some((pc) => isLiveIce(pc.iceConnectionState));
      if (!live) setLinkHint("Buscando la mejor ruta…");
      else if (qualityRungRef.current === 0) setLinkHint("Señal justa. Bajamos un poco para que no se corte.");
      else setLinkHint("");
    }

    function sendSignal(data: SignalData, to?: string) {
      channelRef.current?.sendSignal(data, to);
      void fetch(`/api/call/${roomId}/signal`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ to, data }),
      }).catch(() => undefined);
    }

    function markMediaReady() {
      if (mediaReadySent.current) return;
      mediaReadySent.current = true;
      void fetch(`/api/call/${roomId}/ready`, { method: "POST", credentials: "include" })
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          if (data?.endsAt) setEndsAt(data.endsAt);
        })
        .catch(() => undefined);
    }

    function knownPeerIds() {
      return [...new Set([hostUserIdRef.current, callerUserIdRef.current, guestUserIdRef.current].filter((id): id is string => !!id && id !== user.id))];
    }

    function parkNow() {
      if (!streamRef.current) return;
      if (closingRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        peersRef.current.forEach((pc) => pc.close());
        peersRef.current.clear();
        channelRef.current?.disconnect();
        channelRef.current = null;
        return;
      }
      channelRef.current?.disconnect();
      channelRef.current = null;
      holdCall({
        roomId,
        userId: user.id,
        stream: streamRef.current,
        peers: peersRef.current,
        pendingIce: pendingIceRef.current,
        peerBorn: peerBornRef.current,
        seenSignals: seenSignalsRef.current,
        iceServers: iceServersRef.current,
      });
    }

    function wirePeer(peerId: string, pc: RTCPeerConnection) {
      pc.ontrack = (ev) => {
        const remote = ev.streams[0] ?? new MediaStream(ev.track ? [ev.track] : []);
        if (remote.getTracks().length) {
          upsertRemote(peerId, remote);
          markMediaReady();
        }
      };
      pc.onicecandidate = (ev) => {
        if (ev.candidate) sendSignal({ candidate: ev.candidate.toJSON() }, peerId);
      };
      pc.oniceconnectionstatechange = () => {
        if (pc.iceConnectionState === "connected" || pc.iceConnectionState === "completed") {
          missingPeersRef.current.delete(peerId);
          markMediaReady();
          void applySendQuality(pc, Math.max(1, peersRef.current.size), qualityRungRef.current);
          if (!unmounted) setLinkHint("");
          return;
        }
        if (document.visibilityState === "hidden") return;
        if (pc.iceConnectionState !== "failed" && pc.iceConnectionState !== "disconnected") return;
        window.setTimeout(() => {
          if (peersRef.current.get(peerId) !== pc || document.visibilityState === "hidden") return;
          if (pc.iceConnectionState === "failed" || pc.iceConnectionState === "disconnected") void restartIce(peerId);
        }, 8_000);
      };
    }

    async function ensurePeer(peerId: string, force = false) {
      if (!peerId || peerId === user.id || !streamRef.current) return;
      const existing = peersRef.current.get(peerId);
      const age = Date.now() - (peerBornRef.current.get(peerId) ?? Date.now());
      if (existing && !force && !isStuckPeer(existing, age) && existing.connectionState !== "closed" && existing.connectionState !== "failed") {
        return;
      }
      existing?.close();
      const pc = new RTCPeerConnection(rtcConfig(iceServersRef.current));
      streamRef.current.getTracks().forEach((t) => pc.addTrack(t, streamRef.current!));
      await applySendQuality(pc, Math.max(1, peersRef.current.size + 1), qualityRungRef.current);
      wirePeer(peerId, pc);
      peersRef.current.set(peerId, pc);
      peerBornRef.current.set(peerId, Date.now());
    }

    async function restartIce(peerId: string) {
      const pc = peersRef.current.get(peerId);
      if (!pc || user.id > peerId) return;
      try {
        const offer = await pc.createOffer({ iceRestart: true });
        await pc.setLocalDescription(offer);
        sendSignal({ sdp: offer }, peerId);
      } catch {
        /* reintento en el siguiente pulso */
      }
    }

    async function makeOffer(peerId: string) {
      const pc = peersRef.current.get(peerId);
      const age = Date.now() - (peerBornRef.current.get(peerId) ?? 0);
      if (!pc || user.id > peerId || !shouldOffer(pc, age) || makingOfferRef.current.has(peerId)) return;
      makingOfferRef.current.add(peerId);
      try {
        const offer = await pc.createOffer(pc.remoteDescription ? { iceRestart: true } : undefined);
        if (pc.signalingState !== "stable") return;
        await pc.setLocalDescription(offer);
        sendSignal({ sdp: offer }, peerId);
      } catch {
        /* glare */
      } finally {
        makingOfferRef.current.delete(peerId);
      }
    }

    const lastResend = new Map<string, number>();
    function resendLocal(peerId: string) {
      const pc = peersRef.current.get(peerId);
      if (!pc || user.id > peerId) return;
      if (pc.signalingState !== "have-local-offer" || !pc.localDescription) return;
      const now = Date.now();
      if (now - (lastResend.get(peerId) ?? 0) < 8_000) return;
      lastResend.set(peerId, now);
      sendSignal({ sdp: pc.localDescription.toJSON() }, peerId);
    }

    async function handleSignal(data: SignalData, from: string) {
      if (!from || from === user.id) return;
      const key = signalKey(from, data);
      if (seenSignalsRef.current.has(key)) return;
      await ensurePeer(from);
      let pc = peersRef.current.get(from);
      if (!pc) return;
      const polite = user.id > from;
      try {
        if (data.sdp) {
          const collision = data.sdp.type === "offer" && (makingOfferRef.current.has(from) || pc.signalingState !== "stable");
          if (collision && !polite) {
            seenSignalsRef.current.add(key);
            return;
          }
          if (collision && polite) {
            try {
              await pc.setLocalDescription({ type: "rollback" });
            } catch {
              await ensurePeer(from, true);
              pc = peersRef.current.get(from);
              if (!pc) return;
            }
          }
          await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
          await flushIce(from, pc);
          if (data.sdp.type === "offer") {
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            sendSignal({ sdp: answer }, from);
          }
        }
        if (data.candidate) {
          pc = peersRef.current.get(from) ?? pc;
          if (!pc.remoteDescription) {
            const q = pendingIceRef.current.get(from) ?? [];
            q.push(data.candidate);
            pendingIceRef.current.set(from, q);
          } else {
            await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
          }
        }
        seenSignalsRef.current.add(key);
      } catch {
        seenSignalsRef.current.delete(key);
      }
    }

    let retriedMute = false;
    async function healMedia() {
      if (unmounted || document.visibilityState === "hidden") return;
      const stream = streamRef.current;
      if (!stream) return;
      const video = stream.getVideoTracks()[0];
      const audio = stream.getAudioTracks()[0];
      const ended = !video || video.readyState === "ended" || !audio || audio.readyState === "ended";
      if (!ended) {
        peersRef.current.forEach((pc, id) => {
          if (pc.iceConnectionState === "failed" || pc.connectionState === "failed" || pc.iceConnectionState === "disconnected") {
            void restartIce(id);
          }
        });
        if (video?.muted && video.enabled && !retriedMute) {
          retriedMute = true;
          window.setTimeout(() => {
            if (video.readyState === "live" && video.muted) {
              video.stop();
              void healMedia();
            }
          }, 1_200);
        }
        return;
      }
      try {
        const fresh = await getCallMedia();
        if (unmounted) {
          fresh.getTracks().forEach((track) => track.stop());
          return;
        }
        stream.getTracks().forEach((track) => track.stop());
        streamRef.current = fresh;
        setLocalStream(fresh);
        await playLocal(fresh);
        await syncPeerTracks(peersRef.current.values(), fresh);
        setCamReady(true);
      } catch {
        /* la cámara vuelve al tocar Volver */
      }
    }

    async function start() {
      const adopted = takeHeld(roomId, user.id);
      const adoptedLive = !!adopted?.stream.getTracks().some((track) => track.readyState === "live");
      if (adopted && !adoptedLive) {
        adopted.stream.getTracks().forEach((track) => track.stop());
        adopted.peers.forEach((pc) => pc.close());
      }

      setLinkHint(adoptedLive ? "Sigues en la llamada…" : "Encendiendo cámara…");
      const icePromise = fetch("/api/call/ice", { credentials: "include" })
        .then((r) => (r.ok ? r.json() : { iceServers: defaultIceServers() }))
        .then((data) => {
          if (Array.isArray(data.iceServers) && data.iceServers.length) iceServersRef.current = data.iceServers;
        })
        .catch(() => undefined);

      if (adoptedLive && adopted) {
        streamRef.current = adopted.stream;
        peersRef.current = adopted.peers;
        pendingIceRef.current = adopted.pendingIce;
        peerBornRef.current = adopted.peerBorn;
        seenSignalsRef.current = adopted.seenSignals;
        if (adopted.iceServers.length) iceServersRef.current = adopted.iceServers;
        peersRef.current.forEach((pc, id) => wirePeer(id, pc));
        setLocalStream(adopted.stream);
        await playLocal(adopted.stream);
        setCamReady(true);
        setLinkHint("Conectando la noche…");
      } else {
        try {
          streamRef.current = await getCallMedia();
          if (unmounted) {
            parkNow();
            return;
          }
          setLocalStream(streamRef.current);
          await playLocal(streamRef.current);
          setCamReady(true);
          setLinkHint("Conectando la noche…");
        } catch {
          setCamError("El celular pide permiso. Toca Permitir en cámara y micrófono, o toca la pantalla negra y vuelve a entrar.");
          return;
        }
      }
      await icePromise;
      if (unmounted) {
        parkNow();
        return;
      }
      pullers.push(
        armCallBackground({
          video: () => localRef.current,
          onVisible: () => {
            void healMedia();
          },
        }),
      );

      let socketToken: string | undefined;
      if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
        const tokenRes = await fetch("/api/auth/socket", { credentials: "include" });
        const tokenJson = await tokenRes.json().catch(() => ({}));
        if (tokenRes.ok && tokenJson.token) socketToken = tokenJson.token as string;
      }

      try {
        const channel = await connectCallChannel(
          roomId,
          { id: user.id, displayName: user.displayName, role: user.role },
          {
            onPeers: (ids) => {
              const unique = [...new Set([...ids, ...knownPeerIds()].filter(Boolean))];
              void (async () => {
                for (const id of unique) {
                  if (id === user.id) continue;
                  await ensurePeer(id);
                  await makeOffer(id);
                  resendLocal(id);
                }
              })();
            },
            onPeerJoined: (id) => {
              void (async () => {
                await ensurePeer(id);
                await makeOffer(id);
              })();
            },
            onSignal: (data, from) => {
              void handleSignal(data, from);
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
              setJoiningName(null);
              namesRef.current[guest.userId] = guest.displayName;
              pushLine({
                from: "KITTY",
                role: "SYSTEM",
                body: `${guest.displayName} entró a la noche`,
                at: Date.now(),
                kind: "system",
              });
              void (async () => {
                await ensurePeer(guest.userId);
                await makeOffer(guest.userId);
              })();
            },
            onGuestLeft: (guest) => {
              if (guest.userId === user.id) return;
              if (!guest.kicked) return;
              setGuestName(null);
              setGuestUserId(null);
              setJoiningName(null);
              setRemotes((prev) => prev.filter((r) => r.id !== guest.userId));
              const pc = peersRef.current.get(guest.userId);
              pc?.close();
              peersRef.current.delete(guest.userId);
              pushLine({
                from: "KITTY",
                role: "SYSTEM",
                body: `${guest.displayName ?? "La Kitty invitada"} salió de la noche`,
                at: Date.now(),
                kind: "system",
              });
            },
            onCallEnded: () => {
              if (isHost && guestNameRef.current) {
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
          parkNow();
          return;
        }
        channelRef.current = channel;
        if (mySeat === "GUEST") {
          channel.sendGuestJoined({ displayName: user.displayName, userId: user.id });
        }
        setLinkHint("Esperando a que el otro entre…");
      } catch {
        if (!unmounted) setLinkHint("La señal va por la sala. Sigue en la llamada.");
      }

      async function pullSignals() {
        const since = Date.now() - 20_000;
        const res = await fetch(`/api/call/${roomId}/signal?after=${since}`, { credentials: "include" });
        const data = await res.json().catch(() => ({ signals: [] }));
        for (const row of data.signals ?? []) {
          if (row.from) await handleSignal(row.data ?? {}, row.from);
        }
      }
      void pullSignals();
      const pullTick = window.setInterval(() => {
        if (!unmounted) void pullSignals();
      }, 700);
      pullers.push(() => window.clearInterval(pullTick));
      void (async () => {
        for (const id of knownPeerIds()) {
          await ensurePeer(id);
          await makeOffer(id);
        }
      })();
    }

    const pullers: Array<() => void> = [];

    const tuneTick = window.setInterval(() => {
      if (unmounted || document.visibilityState === "hidden") return;
      void tuneAll();
      void (async () => {
        for (const id of knownPeerIds()) {
          const pc = peersRef.current.get(id);
          const age = Date.now() - (peerBornRef.current.get(id) ?? 0);
          if (pc && isStuckPeer(pc, age)) await ensurePeer(id, true);
          else await ensurePeer(id);
          await makeOffer(id);
          resendLocal(id);
        }
      })();
    }, 2500);

    void start();
    return () => {
      unmounted = true;
      window.clearInterval(tuneTick);
      pullers.forEach((stop) => stop());
      parkNow();
    };
  }, [roomId, me?.id, me?.role, me?.displayName, hostName, isHost, isUser, mySeat, router]);

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

  async function buyTip(tip: MenuTip) {
    if (sending) return;
    setSending(true);
    showBloom(tip.orbes);
    const res = await fetch(`/api/call/${roomId}/tips`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tipId: tip.id }),
    });
    const data = await res.json().catch(() => ({}));
    setSending(false);
    if (!res.ok) {
      setNote(data.error ?? "No se pudo enviar");
      return;
    }
    channelRef.current?.sendOrbe(tip.orbes, tip.title);
    pushLine({
      from: me?.displayName ?? "tú",
      role: "USER",
      body: `pidió “${tip.title}” · ${tip.orbes} orbes`,
      at: Date.now(),
      kind: "orbe",
      orbes: tip.orbes,
      activity: tip.title,
    });
    setProposeOpen(false);
    setNote("");
    await refresh();
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
      if (data.endsAt) setEndsAt(data.endsAt);
      await refresh();
    }
    setPending(null);
  }

  async function createRoom() {
    if (sending) return;
    setSending(true);
    const res = await fetch(`/api/call/${roomId}/room`, { method: "POST" });
    const data = await res.json().catch(() => ({}));
    setSending(false);
    if (!res.ok) {
      setNote(data.error ?? "No se pudo crear la sala");
      return;
    }
    setPhase("ROOM");
    setEndsAt(data.endsAt ?? null);
    showBloom(ROOM_ORBES);
    await refresh();
  }

  async function askMoreTime() {
    if (sending) return;
    setSending(true);
    const res = await fetch(`/api/call/${roomId}/time`, { method: "POST" });
    const data = await res.json().catch(() => ({}));
    setSending(false);
    if (!res.ok) {
      setNote(data.error ?? "No se pudo pedir más tiempo");
      return;
    }
    const ask = data.activity as ActivityAsk;
    setPending(ask);
    channelRef.current?.sendActivity(ask);
    pushLine({
      from: me?.displayName ?? "tú",
      role: "USER",
      body: `pide +${EXTEND_MINUTES} minutos por ${EXTEND_ORBES} orbes · esperando a ella`,
      at: Date.now(),
      kind: "activity",
      orbes: EXTEND_ORBES,
      activity: `+${EXTEND_MINUTES} minutos`,
      status: "PENDING",
    });
  }

  async function onStreamChange(stream: MediaStream) {
    streamRef.current = stream;
    setLocalStream(stream);
    const el = localRef.current;
    if (el) {
      el.srcObject = stream;
      void el.play().catch(() => undefined);
    }
    await syncPeerTracks(peersRef.current.values(), stream);
  }

  async function openInvite() {
    setNote("");
    setInviteOpen(true);
    if (!isHost) return;
    const res = await fetch(`/api/call/${roomId}/invite`, { credentials: "include" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setNote(data.error ?? "No se pudo abrir la lista");
    }
    setInvitees(data.kittys ?? []);
    if (!data.guestId) {
      setJoiningName(null);
      if (!guestUserIdRef.current) {
        setGuestName(null);
        setGuestUserId(null);
      }
    }
  }

  async function kickGuest() {
    if (!isHost) return;
    setSending(true);
    const res = await fetch(`/api/call/${roomId}/kick`, { method: "POST", credentials: "include" });
    const data = await res.json().catch(() => ({}));
    setSending(false);
    if (!res.ok) {
      setNote(data.error ?? "No se pudo expulsar");
      return;
    }
    const gone = {
      userId: data.guest?.userId ?? guestUserId ?? "",
      displayName: data.guest?.displayName ?? guestName ?? joiningName ?? undefined,
      kicked: true,
    };
    channelRef.current?.sendGuestLeft(gone);
    setGuestName(null);
    setGuestUserId(null);
    setJoiningName(null);
    if (gone.userId) {
      setRemotes((prev) => prev.filter((r) => r.id !== gone.userId));
      peersRef.current.get(gone.userId)?.close();
      peersRef.current.delete(gone.userId);
    }
    pushLine({
      from: hostName,
      role: "SYSTEM",
      body: `expulsó a ${gone.displayName ?? "la Kitty invitada"} de esta noche`,
      at: Date.now(),
      kind: "system",
    });
    const list = await fetch(`/api/call/${roomId}/invite`, { credentials: "include" });
    const next = await list.json().catch(() => ({}));
    setInvitees(next.kittys ?? []);
    setNote("");
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
    closingRef.current = true;
    dropHeld();
    const res = await fetch(`/api/call/${roomId}/end`, { method: "POST" });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.left === "guest") {
      channelRef.current?.sendGuestLeft({
        userId: me?.id ?? "",
        displayName: me?.displayName,
        kicked: false,
      });
    } else if (res.ok) {
      channelRef.current?.sendCallEnded();
    }
    router.push(isUser ? "/inbox" : "/studio");
  }

  const previewOver = phase === "PREVIEW" && !!endsAt && new Date(endsAt).getTime() <= nowTick;

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
    if (isHost && guestNameRef.current) {
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

  const mobileActions = isUser ? 4 : canKick ? 4 : canInvite ? 3 : 2;

  return (
    <div className="relative mx-auto grid h-[calc(100dvh-56px)] max-w-[1400px] overflow-hidden md:h-auto md:min-h-[calc(100vh-80px)] md:grid-cols-[1fr_380px]">
      <div className="relative h-full min-h-0 overflow-hidden bg-black md:min-h-[calc(100vh-80px)]">
        <div className={`absolute inset-0 pb-[9.2rem] md:pb-0 ${remotes.length > 1 ? "grid grid-cols-1 md:grid-cols-2" : ""}`}>
          {remotes.length === 0 && (
            <div className="grid h-full place-items-center bg-gradient-to-b from-plum to-void px-6 text-center">
              <div>
                <p className="font-serif text-3xl">Esperando a {peerLabel}…</p>
                <p className="mt-3 text-sm text-orchid/80">
                  {camReady
                    ? "Tu cámara ya está prendida. El recuadro chiquito eres tú."
                    : "Encendiendo tu cámara. Si sale un aviso, toca Permitir."}
                </p>
                {linkHint && <p className="mt-2 text-xs text-orchid/60">{linkHint}</p>}
              </div>
            </div>
          )}
          {remotes.map((r) => (
            <RemoteTile key={r.id} stream={r.stream} name={r.name} />
          ))}
        </div>

        {canInvite && phase === "ROOM" && (
          <button
            type="button"
            className="glow-btn propose-pulse absolute left-3 top-3 z-20 max-w-[46%] px-3 py-2 text-[11px] leading-tight md:left-4 md:top-4 md:max-w-none md:px-5 md:py-2.5 md:text-sm"
            onClick={() => void openInvite()}
          >
            Invitar a otra Kitty
          </button>
        )}

        <CallTimer
          phase={phase}
          remainingMs={endsAt ? new Date(endsAt).getTime() - nowTick : null}
          isUser={isUser}
          busy={sending}
          onCreateRoom={() => void createRoom()}
          onMoreTime={() => void askMoreTime()}
        />

        {isUser && previewOver && (
          <div className="absolute inset-x-3 bottom-28 z-30 md:inset-x-auto md:bottom-28 md:left-1/2 md:w-[min(420px,90%)] md:-translate-x-1/2">
            <div className="rounded-3xl border border-violet-300/40 bg-black/75 p-4 text-center backdrop-blur-md">
              <p className="font-serif text-2xl text-violet-100">¿Creas la sala con ella?</p>
              <p className="mt-1 text-sm text-violet-200/75">Los 5 minutos se acabaron. Si hubo chispa, la noche sigue.</p>
              <button type="button" className="glow-btn mt-3 w-full py-3 text-sm" disabled={sending} onClick={() => void createRoom()}>
                Crear la sala · {ROOM_ORBES} orbes · {ROOM_MINUTES} min
              </button>
              {note && <p className="mt-2 text-xs text-rose-300">{note}</p>}
            </div>
          </div>
        )}

        <video
          ref={localRef}
          autoPlay
          muted
          playsInline
          className={`absolute right-3 top-3 z-10 h-20 w-14 rounded-2xl border border-orchid/40 object-cover shadow-xl md:right-4 md:top-4 md:h-36 md:w-28 ${mirrored ? "-scale-x-100" : ""}`}
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

        {camError && <p className="absolute bottom-28 left-3 right-3 z-20 rounded-2xl bg-black/70 p-3 text-sm md:bottom-40">{camError}</p>}

        <div className="absolute inset-x-0 bottom-0 z-20 hidden bg-gradient-to-t from-black via-black/70 to-transparent p-5 md:block">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-[10px] uppercase tracking-[0.3em] text-orchid/70">
                noche privada{linkHint ? ` · ${linkHint}` : ""}
              </p>
              <p className="font-serif text-2xl">
                {hostName}
                {guestName ? ` · ${guestName}` : ""}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <CallMediaDock stream={localStream} mirrored={mirrored} onMirror={setMirrored} onStreamChange={onStreamChange} />
              {isUser && phase === "ROOM" && (
                <button className="glow-btn propose-pulse px-5 py-2 text-sm" onClick={() => setProposeOpen(true)}>
                  Su menú
                </button>
              )}
              {canInvite && phase === "ROOM" && (
                <button className="glow-btn propose-pulse px-5 py-2 text-sm" onClick={() => void openInvite()}>
                  {hasGuest ? `Con ${guestName}` : joiningName ? `Esperando a ${joiningName}` : "Invitar a otra Kitty"}
                </button>
              )}
              {canKick && (
                <button className="rounded-full border border-rose-400/50 px-4 py-2 text-sm text-rose-200" onClick={() => void kickGuest()}>
                  Expulsar
                </button>
              )}
              <button className="rounded-full bg-white/10 px-4 py-2 text-sm" onClick={askClose}>
                {isHost ? "Cerrar noche" : "Salir"}
              </button>
            </div>
          </div>
        </div>

        <div className="call-toolbar absolute inset-x-0 bottom-0 z-30 border-t border-white/10 bg-black/80 px-2 pt-2 md:hidden">
          <p className="mb-1 truncate px-1 text-center font-serif text-sm text-orchid/80">
            {hostName}
            {guestName ? ` · ${guestName}` : ""}
          </p>
          <div className="mb-2">
            <CallMediaDock stream={localStream} mirrored={mirrored} onMirror={setMirrored} onStreamChange={onStreamChange} />
          </div>
          <div className={`grid gap-2 ${mobileActions === 4 ? "grid-cols-4" : mobileActions === 3 ? "grid-cols-3" : "grid-cols-2"}`}>
            <button type="button" className="call-action" onClick={() => setChatOpen(true)}>
              <span>Chat</span>
              {unread > 0 && <span className="text-[10px] text-magenta">{unread}</span>}
            </button>
            {isUser && phase === "ROOM" && (
              <button type="button" className="call-action call-action-main propose-pulse" onClick={() => setProposeOpen(true)}>
                Menú
              </button>
            )}
            {isUser && phase === "PREVIEW" && (
              <button type="button" className="call-action call-action-main propose-pulse" onClick={() => void createRoom()}>
                Sala
              </button>
            )}
            {isUser && (
              <a href="/wallet" target="_blank" rel="noreferrer" className="call-action">
                Orbes
              </a>
            )}
            {canInvite && phase === "ROOM" && (
              <button type="button" className="call-action call-action-main propose-pulse" onClick={() => void openInvite()}>
                Invitar
              </button>
            )}
            {canKick && (
              <button type="button" className="call-action" onClick={() => void kickGuest()}>
                Expulsar
              </button>
            )}
            <button type="button" className="call-action" onClick={askClose}>
              {isHost ? "Cerrar" : "Salir"}
            </button>
          </div>
        </div>
      </div>

      <aside className="room-chat hidden flex-col md:flex">
        <div className="border-b border-orchid/15 px-4 py-3">
          <p className="text-[10px] uppercase tracking-[0.3em] text-orchid/70">la habitación</p>
          <p className="font-serif text-2xl">{hostName}</p>
          <p className="text-xs text-white/50">Mensajes, orbes y lo que ella acepta. Nada de escenario público.</p>
        </div>
        {isUser && phase === "ROOM" && (
          <div className="border-b border-orchid/10 px-4 py-3">
            <button className="glow-btn propose-pulse w-full py-3 text-sm" onClick={() => setProposeOpen(true)}>
              Su menú
            </button>
          </div>
        )}
        {canInvite && phase === "ROOM" && (
          <div className="border-b border-orchid/10 px-4 py-3">
            <button className="glow-btn propose-pulse w-full py-3 text-sm" onClick={() => void openInvite()}>
              Invitar a otra Kitty
            </button>
            <p className="mt-2 text-[11px] leading-snug text-orchid/65">
              {hasGuest
                ? `${guestName} está conectada ahora. Puedes expulsarla si quieres invitar a otra. Los orbes del user siguen yendo a ti.`
                : joiningName
                  ? `${joiningName} aceptó pero todavía no entra a la sala. Si no llega, expúlsala e invita a otra.`
                  : "Le llega una llamada grande. Si entra, quedan ustedes dos y el user. Los orbes siguen yendo a ti."}
            </p>
            {canKick && (
              <button className="mt-3 w-full rounded-full border border-rose-400/45 py-2 text-sm text-rose-200" onClick={() => void kickGuest()}>
                Expulsar a {guestName ?? joiningName}
              </button>
            )}
          </div>
        )}
        {chatPanel}
      </aside>

      {chatOpen && (
        <div className="fixed inset-0 z-40 bg-black/55 md:hidden" onClick={() => setChatOpen(false)}>
          <div
            className="room-chat absolute inset-x-0 bottom-[5.75rem] flex h-[min(62vh,520px)] flex-col rounded-t-3xl"
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
        <div className="fixed inset-0 z-50 grid place-items-end overflow-y-auto bg-black/75 p-3 pb-28 md:place-items-center md:p-4 md:pb-4">
          <div className="glass w-full max-w-lg rounded-3xl p-5 md:p-6">
            <p className="text-[10px] uppercase tracking-[0.3em] text-magenta">su menú</p>
            <h3 className="font-serif text-3xl">Elige lo que {hostName} ya puso en su carta</h3>
            <p className="mt-2 text-sm text-orchid/75">
              Tocas una acción y le das los orbes que ella pidió. Ya dijo que se siente cómoda haciéndolo.
            </p>
            <div className="mt-4 max-h-56 space-y-2 overflow-y-auto">
              {menuTips.length === 0 && <p className="text-sm text-white/50">Todavía no armó su menú.</p>}
              {menuTips.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  disabled={sending}
                  className="flex w-full items-center justify-between rounded-2xl border border-orchid/20 px-4 py-3 text-left hover:bg-white/5"
                  onClick={() => void buyTip(t)}
                >
                  <span className="pr-3 font-serif text-lg">{t.title}</span>
                  <span className="shrink-0 text-sm text-magenta">{t.orbes} orbes</span>
                </button>
              ))}
            </div>
            <p className="mt-5 text-xs uppercase tracking-[0.25em] text-white/40">o propónle algo tuyo</p>
            <h3 className="font-serif text-2xl">Proponerle algo a {hostName}</h3>
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
            <h3 className="mt-2 font-serif text-4xl md:text-5xl">
              {pending.activity.startsWith("+") ? `${pending.from} quiere más tiempo` : `${pending.from} te pide esto`}
            </h3>
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
            {hasGuest ? (
              <p className="mt-2 text-sm text-orchid/75">
                {guestName} está conectada ahora. Si la expulsas, puedes invitar a otra. Los orbes del user siguen yendo a ti.
              </p>
            ) : joiningName ? (
              <p className="mt-2 text-sm text-orchid/75">
                {joiningName} aceptó la invitación pero no está en la sala. Expúlsala para invitar a otra.
              </p>
            ) : !isHost ? (
              <p className="mt-2 text-sm text-orchid/75">Solo la anfitriona de esta noche puede mandar la invitación.</p>
            ) : (
              <p className="mt-2 text-sm text-orchid/75">
                Le llega una llamada grande. Si hay varias invitadas, cada una elige. La primera que entre se queda. Los orbes del user siguen yendo a ti.
              </p>
            )}
            {canKick && (
              <button className="mt-4 w-full rounded-full border border-rose-400/45 py-3 text-rose-200" disabled={sending} onClick={() => void kickGuest()}>
                Expulsar a {guestName ?? joiningName}
              </button>
            )}
            {!hasGuest && !joiningName && isHost && (
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
            )}
            {note && <p className="mt-3 text-sm text-rose-300">{note}</p>}
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
