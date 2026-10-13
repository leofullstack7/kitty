import { NextResponse } from "next/server";
import { jsonError, requireSession } from "@/lib/auth";
import { defaultIceServers } from "@/lib/webrtc";

function envIce(): RTCIceServer[] {
  const urls = (process.env.TURN_URLS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const username = process.env.TURN_USERNAME?.trim();
  const credential = process.env.TURN_CREDENTIAL?.trim();
  if (!urls.length || !username || !credential) return [];
  return [{ urls, username, credential }];
}

async function meteredIce(): Promise<RTCIceServer[]> {
  const key = process.env.METERED_TURN_KEY?.trim();
  const app = process.env.METERED_TURN_APP?.trim();
  if (!key || !app) return [];
  try {
    const res = await fetch(`https://${app}.metered.live/api/v1/turn/credentials?apiKey=${encodeURIComponent(key)}`, {
      cache: "no-store",
    });
    if (!res.ok) return [];
    const data = (await res.json()) as RTCIceServer[];
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

const FREE_TURN: RTCIceServer[] = [
  {
    urls: [
      "turn:freeturn.net:3478",
      "turn:freeturn.net:3478?transport=tcp",
      "turns:freeturn.net:5349",
      "turns:freeturn.tel:5349",
    ],
    username: "free",
    credential: "free",
  },
  {
    urls: [
      "turn:openrelay.metered.ca:80",
      "turn:openrelay.metered.ca:443",
      "turn:openrelay.metered.ca:443?transport=tcp",
      "turns:openrelay.metered.ca:443",
    ],
    username: "openrelayproject",
    credential: "openrelayproject",
  },
];

export async function GET() {
  const ctx = await requireSession();
  if (!ctx) return jsonError("No autenticado", 401);
  const extra = [...envIce(), ...(await meteredIce())];
  const iceServers = [...defaultIceServers(), ...FREE_TURN, ...extra];
  return NextResponse.json({ iceServers, relay: true });
}
