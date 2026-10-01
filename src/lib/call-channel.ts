"use client";

import { createClient, type RealtimeChannel, type SupabaseClient } from "@supabase/supabase-js";
import { io, type Socket } from "socket.io-client";

export type ChatLine = {
  id?: string;
  from: string;
  role: string;
  body: string;
  at: number;
  kind?: "chat" | "orbe" | "activity" | "system";
  orbes?: number;
  activity?: string;
  status?: string;
};

export type SignalData = { sdp?: RTCSessionDescriptionInit; candidate?: RTCIceCandidateInit };

export type ActivityAsk = { id: string; activity: string; orbes: number; from: string };
export type ActivityDecision = { id: string; status: "ACCEPTED" | "REJECTED"; activity: string; orbes: number };

type Handlers = {
  onSignal: (data: SignalData, from: string) => void;
  onChat: (line: ChatLine) => void;
  onOrbeBurst: (line: { from: string; orbes: number; activity: string; at: number }) => void;
  onPeers: (ids: string[]) => void;
  onActivity?: (ask: ActivityAsk) => void;
  onActivityDecision?: (decision: ActivityDecision) => void;
  onGuestJoined?: (guest: { displayName: string; userId: string }) => void;
  onCallEnded?: () => void;
};

export type CallChannel = {
  sendSignal: (data: SignalData, to?: string) => void;
  sendChat: (body: string) => void;
  sendOrbe: (orbes: number, activity: string) => void;
  sendActivity: (ask: ActivityAsk) => void;
  sendActivityDecision: (decision: ActivityDecision) => void;
  sendGuestJoined: (guest: { displayName: string; userId: string }) => void;
  sendCallEnded: () => void;
  disconnect: () => void;
};

function supabaseBrowser(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function connectCallChannel(
  roomId: string,
  user: { id: string; displayName: string; role: string },
  handlers: Handlers,
  socketToken?: string,
): Promise<CallChannel> {
  const sb = supabaseBrowser();
  if (sb) return connectSupabase(sb, roomId, user, handlers);
  return connectSocket(roomId, user, handlers, socketToken);
}

function connectSupabase(
  sb: SupabaseClient,
  roomId: string,
  user: { id: string; displayName: string; role: string },
  handlers: Handlers,
): CallChannel {
  const channel: RealtimeChannel = sb.channel(`call:${roomId}`, {
    config: { broadcast: { self: false }, presence: { key: user.id } },
  });

  channel
    .on("broadcast", { event: "signal" }, ({ payload }) => {
      if (!payload || payload.from === user.id) return;
      if (payload.to && payload.to !== user.id) return;
      handlers.onSignal(payload.data ?? {}, String(payload.from ?? ""));
    })
    .on("broadcast", { event: "chat" }, ({ payload }) => handlers.onChat(payload as ChatLine))
    .on("broadcast", { event: "orbe-burst" }, ({ payload }) =>
      handlers.onOrbeBurst(payload as { from: string; orbes: number; activity: string; at: number }),
    )
    .on("broadcast", { event: "activity" }, ({ payload }) => handlers.onActivity?.(payload as ActivityAsk))
    .on("broadcast", { event: "activity-decision" }, ({ payload }) =>
      handlers.onActivityDecision?.(payload as ActivityDecision),
    )
    .on("broadcast", { event: "guest-joined" }, ({ payload }) =>
      handlers.onGuestJoined?.(payload as { displayName: string; userId: string }),
    )
    .on("broadcast", { event: "call-ended" }, () => handlers.onCallEnded?.())
    .on("presence", { event: "sync" }, () => {
      handlers.onPeers(Object.keys(channel.presenceState()));
    })
    .subscribe(async (status) => {
      if (status === "SUBSCRIBED") {
        await channel.track({ displayName: user.displayName, role: user.role });
      }
    });

  return {
    sendSignal: (data, to) => {
      void channel.send({ type: "broadcast", event: "signal", payload: { from: user.id, to, data } });
    },
    sendChat: (body) => {
      void channel.send({
        type: "broadcast",
        event: "chat",
        payload: { from: user.displayName, role: user.role, body, at: Date.now(), kind: "chat" },
      });
    },
    sendOrbe: (orbes, activity) => {
      void channel.send({
        type: "broadcast",
        event: "orbe-burst",
        payload: { from: user.displayName, orbes, activity, at: Date.now() },
      });
    },
    sendActivity: (ask) => {
      void channel.send({ type: "broadcast", event: "activity", payload: ask });
    },
    sendActivityDecision: (decision) => {
      void channel.send({ type: "broadcast", event: "activity-decision", payload: decision });
    },
    sendGuestJoined: (guest) => {
      void channel.send({ type: "broadcast", event: "guest-joined", payload: guest });
    },
    sendCallEnded: () => {
      void channel.send({ type: "broadcast", event: "call-ended", payload: { at: Date.now() } });
    },
    disconnect: () => {
      void sb.removeChannel(channel);
    },
  };
}

function connectSocket(
  roomId: string,
  user: { id: string; displayName: string; role: string },
  handlers: Handlers,
  socketToken?: string,
): Promise<CallChannel> {
  return new Promise((resolve, reject) => {
    if (!socketToken) {
      reject(new Error("No hay canal en vivo"));
      return;
    }
    const signalUrl = process.env.NEXT_PUBLIC_SIGNAL_URL || `${window.location.protocol}//${window.location.hostname}:3001`;
    const socket: Socket = io(signalUrl, { path: "/socket.io", auth: { token: socketToken }, withCredentials: true });
    socket.on("connect", () => socket.emit("join-room", roomId));
    socket.on("room-peers", (state: { peers: string[] }) => handlers.onPeers(state.peers ?? []));
    socket.on("peer-joined", () => undefined);
    socket.on("signal", ({ from, data }: { from: string; data: SignalData }) => handlers.onSignal(data, from));
    socket.on("chat", (line: ChatLine) => handlers.onChat(line));
    socket.on("orbe-burst", (line: { from: string; orbes: number; activity: string; at: number }) =>
      handlers.onOrbeBurst(line),
    );
    socket.on("activity", (ask: ActivityAsk) => handlers.onActivity?.(ask));
    socket.on("activity-decision", (decision: ActivityDecision) => handlers.onActivityDecision?.(decision));
    socket.on("guest-joined", (guest: { displayName: string; userId: string }) => handlers.onGuestJoined?.(guest));
    socket.on("call-ended", () => handlers.onCallEnded?.());
    socket.once("connect_error", () => reject(new Error("No se pudo abrir el canal en vivo")));
    resolve({
      sendSignal: (data, to) => socket.emit("signal", { roomId, to, data }),
      sendChat: (body) => socket.emit("chat", { roomId, body }),
      sendOrbe: (orbes, activity) => socket.emit("orbe-burst", { roomId, orbes, activity }),
      sendActivity: (ask) => socket.emit("activity", { roomId, ...ask }),
      sendActivityDecision: (decision) => socket.emit("activity-decision", { roomId, ...decision }),
      sendGuestJoined: (guest) => socket.emit("guest-joined", { roomId, ...guest }),
      sendCallEnded: () => socket.emit("call-ended", { roomId }),
      disconnect: () => socket.disconnect(),
    });
    void user;
  });
}
