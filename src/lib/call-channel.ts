"use client";

import { createClient, type RealtimeChannel, type SupabaseClient } from "@supabase/supabase-js";
import { io, type Socket } from "socket.io-client";

export type ChatLine = { from: string; role: string; body: string; at: number; kind?: "chat" | "orbe" };

export type SignalData = { sdp?: RTCSessionDescriptionInit; candidate?: RTCIceCandidateInit };

type Handlers = {
  onSignal: (data: SignalData) => void;
  onChat: (line: ChatLine) => void;
  onOrbeBurst: (line: { from: string; orbes: number; activity: string; at: number }) => void;
  onPeers: (count: number) => void;
};

export type CallChannel = {
  sendSignal: (data: SignalData) => void;
  sendChat: (body: string) => void;
  sendOrbe: (orbes: number, activity: string) => void;
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
  return connectSocket(roomId, handlers, socketToken);
}

function connectSupabase(sb: SupabaseClient, roomId: string, user: { id: string; displayName: string; role: string }, handlers: Handlers): CallChannel {
  const channel: RealtimeChannel = sb.channel(`call:${roomId}`, {
    config: { broadcast: { self: false }, presence: { key: user.id } },
  });

  channel
    .on("broadcast", { event: "signal" }, ({ payload }) => {
      if (payload?.from === user.id) return;
      handlers.onSignal(payload?.data ?? {});
    })
    .on("broadcast", { event: "chat" }, ({ payload }) => handlers.onChat(payload as ChatLine))
    .on("broadcast", { event: "orbe-burst" }, ({ payload }) =>
      handlers.onOrbeBurst(payload as { from: string; orbes: number; activity: string; at: number }),
    )
    .on("presence", { event: "sync" }, () => {
      handlers.onPeers(Object.keys(channel.presenceState()).length);
    })
    .subscribe(async (status) => {
      if (status === "SUBSCRIBED") {
        await channel.track({ displayName: user.displayName, role: user.role });
      }
    });

  return {
    sendSignal: (data) => {
      void channel.send({ type: "broadcast", event: "signal", payload: { from: user.id, data } });
    },
    sendChat: (body) => {
      void channel.send({
        type: "broadcast",
        event: "chat",
        payload: { from: user.displayName, role: user.role, body, at: Date.now() },
      });
    },
    sendOrbe: (orbes, activity) => {
      void channel.send({
        type: "broadcast",
        event: "orbe-burst",
        payload: { from: user.displayName, orbes, activity, at: Date.now() },
      });
    },
    disconnect: () => {
      void sb.removeChannel(channel);
    },
  };
}

function connectSocket(roomId: string, handlers: Handlers, socketToken?: string): Promise<CallChannel> {
  return new Promise((resolve, reject) => {
    if (!socketToken) {
      reject(new Error("No hay canal en vivo"));
      return;
    }
    const signalUrl = process.env.NEXT_PUBLIC_SIGNAL_URL || `${window.location.protocol}//${window.location.hostname}:3001`;
    const socket: Socket = io(signalUrl, { path: "/socket.io", auth: { token: socketToken }, withCredentials: true });
    socket.on("connect", () => socket.emit("join-room", roomId));
    socket.on("peer-joined", () => handlers.onPeers(2));
    socket.on("room-state", (state: { peers: number }) => handlers.onPeers(state.peers));
    socket.on("signal", ({ data }: { data: SignalData }) => handlers.onSignal(data));
    socket.on("chat", (line: ChatLine) => handlers.onChat(line));
    socket.on("orbe-burst", (line: { from: string; orbes: number; activity: string; at: number }) => handlers.onOrbeBurst(line));
    socket.once("connect_error", () => reject(new Error("No se pudo abrir el canal en vivo")));
    resolve({
      sendSignal: (data) => socket.emit("signal", { roomId, data }),
      sendChat: (body) => socket.emit("chat", { roomId, body }),
      sendOrbe: (orbes, activity) => socket.emit("orbe-burst", { roomId, orbes, activity }),
      disconnect: () => socket.disconnect(),
    });
  });
}
