export const AUDIO_CONSTRAINTS: MediaTrackConstraints = {
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
  channelCount: 1,
};

export const VIDEO_TRIES: MediaStreamConstraints[] = [
  {
    audio: AUDIO_CONSTRAINTS,
    video: {
      facingMode: "user",
      width: { ideal: 720, min: 480 },
      height: { ideal: 1280, min: 640 },
      frameRate: { ideal: 24, max: 30 },
      aspectRatio: { ideal: 9 / 16 },
    },
  },
  {
    audio: AUDIO_CONSTRAINTS,
    video: {
      facingMode: "user",
      width: { ideal: 540 },
      height: { ideal: 960 },
      frameRate: { ideal: 24, max: 30 },
    },
  },
  { audio: AUDIO_CONSTRAINTS, video: { facingMode: "user" } },
  { audio: true, video: true },
];

const PUBLIC_STUN: RTCIceServer[] = [
  { urls: "stun:stun.cloudflare.com:3478" },
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
  { urls: "stun:stun2.l.google.com:19302" },
  { urls: "stun:global.stun.twilio.com:3478" },
  { urls: "stun:freeturn.net:3478" },
  { urls: "stun:freeturn.net:5349" },
];

export function defaultIceServers(): RTCIceServer[] {
  return PUBLIC_STUN;
}

export function rtcConfig(iceServers: RTCIceServer[]): RTCConfiguration {
  return {
    iceServers: iceServers.length ? iceServers : PUBLIC_STUN,
    iceCandidatePoolSize: 0,
    bundlePolicy: "max-bundle",
    rtcpMuxPolicy: "require",
    iceTransportPolicy: "all",
  };
}

export async function getCallMedia(): Promise<MediaStream> {
  let last: unknown;
  for (const constraints of VIDEO_TRIES) {
    try {
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      const video = stream.getVideoTracks()[0];
      if (video) {
        video.contentHint = "motion";
        const settings = video.getSettings();
        if ((settings.frameRate ?? 30) > 30) {
          await video.applyConstraints({ frameRate: { ideal: 24, max: 30 } }).catch(() => undefined);
        }
      }
      stream.getAudioTracks().forEach((t) => {
        t.contentHint = "speech";
      });
      return stream;
    } catch (err) {
      last = err;
    }
  }
  throw last instanceof Error ? last : new Error("No se pudo abrir la cámara");
}

function targetBitrate(peerCount: number, rung: number) {
  const high = peerCount >= 2 ? 1_000_000 : 1_800_000;
  const mid = peerCount >= 2 ? 650_000 : 1_100_000;
  const low = peerCount >= 2 ? 380_000 : 450_000;
  return [low, mid, high][Math.max(0, Math.min(2, rung))]!;
}

function scaleForBitrate(bps: number, peerCount: number) {
  if (peerCount >= 2) {
    if (bps < 450_000) return 2;
    if (bps < 750_000) return 1.5;
    return 1;
  }
  if (bps < 500_000) return 2;
  if (bps < 900_000) return 1.5;
  return 1;
}

export async function applySendQuality(pc: RTCPeerConnection, peerCount: number, rung: number) {
  const maxBitrate = targetBitrate(peerCount, rung);
  const scale = scaleForBitrate(maxBitrate, peerCount);
  for (const sender of pc.getSenders()) {
    if (!sender.track) continue;
    const params = sender.getParameters();
    if (!params.encodings?.length) params.encodings = [{}];
    if (sender.track.kind === "video") {
      params.encodings[0]!.maxBitrate = maxBitrate;
      params.encodings[0]!.maxFramerate = rung === 0 ? 18 : 24;
      params.encodings[0]!.scaleResolutionDownBy = scale;
      params.degradationPreference = "maintain-resolution";
      if (rung === 0) params.degradationPreference = "balanced";
    } else {
      params.encodings[0]!.maxBitrate = 40_000;
    }
    try {
      await sender.setParameters(params);
    } catch {
      /* el navegador aún no tiene encodings */
    }
  }
}

export async function readLinkHealth(pc: RTCPeerConnection) {
  const stats = await pc.getStats();
  let rtt = 0;
  let loss = 0;
  let packets = 0;
  let nack = 0;
  stats.forEach((row) => {
    if (row.type === "candidate-pair" && row.state === "succeeded") {
      rtt = Math.max(rtt, Number(row.currentRoundTripTime ?? 0) * 1000);
    }
    if (row.type === "inbound-rtp" && row.kind === "video") {
      loss += Number(row.packetsLost ?? 0);
      packets += Number(row.packetsReceived ?? 0);
      nack += Number(row.nackCount ?? 0);
    }
    if (row.type === "outbound-rtp" && row.kind === "video") {
      nack += Number(row.nackCount ?? 0);
    }
  });
  const lossRate = packets > 20 ? loss / packets : 0;
  return { rtt, lossRate, nack };
}

export function nextRung(current: number, health: { rtt: number; lossRate: number }) {
  if (health.lossRate > 0.08 || health.rtt > 450) return Math.max(0, current - 1);
  if (health.lossRate < 0.02 && health.rtt < 180) return Math.min(2, current + 1);
  return current;
}

export function isLiveIce(state: RTCIceConnectionState | RTCPeerConnectionState) {
  return state === "connected" || state === "completed";
}

export function shouldOffer(pc: RTCPeerConnection, checkingForMs = 0) {
  if (pc.signalingState !== "stable") return false;
  if (isLiveIce(pc.iceConnectionState) || isLiveIce(pc.connectionState)) return false;
  if (pc.iceConnectionState === "checking" && checkingForMs < 8_000) return false;
  return true;
}

export function isStuckPeer(pc: RTCPeerConnection, ageMs: number) {
  if (isLiveIce(pc.iceConnectionState) || isLiveIce(pc.connectionState)) return false;
  if (pc.connectionState === "failed" || pc.iceConnectionState === "failed") return ageMs > 2_000;
  return ageMs > 12_000 && (pc.connectionState === "new" || pc.connectionState === "connecting" || pc.iceConnectionState === "checking");
}

export type CallDevices = {
  cameras: MediaDeviceInfo[];
  mics: MediaDeviceInfo[];
  speakers: MediaDeviceInfo[];
};

export async function listCallDevices(): Promise<CallDevices> {
  const devices = await navigator.mediaDevices.enumerateDevices();
  return {
    cameras: devices.filter((d) => d.kind === "videoinput"),
    mics: devices.filter((d) => d.kind === "audioinput"),
    speakers: devices.filter((d) => d.kind === "audiooutput"),
  };
}

export async function replaceVideoDevice(stream: MediaStream, constraints: MediaTrackConstraints) {
  const fresh = await navigator.mediaDevices.getUserMedia({ video: constraints, audio: false });
  const next = fresh.getVideoTracks()[0];
  const prev = stream.getVideoTracks()[0];
  if (prev) {
    stream.removeTrack(prev);
    prev.stop();
  }
  if (next) {
    next.contentHint = "motion";
    stream.addTrack(next);
  }
  fresh.getTracks().forEach((t) => {
    if (t !== next) t.stop();
  });
  return stream;
}

export async function replaceAudioDevice(stream: MediaStream, deviceId: string) {
  const fresh = await navigator.mediaDevices.getUserMedia({
    audio: { ...AUDIO_CONSTRAINTS, deviceId: { exact: deviceId } },
    video: false,
  });
  const next = fresh.getAudioTracks()[0];
  const prev = stream.getAudioTracks()[0];
  if (prev) {
    stream.removeTrack(prev);
    prev.stop();
  }
  if (next) {
    next.contentHint = "speech";
    stream.addTrack(next);
  }
  fresh.getTracks().forEach((t) => {
    if (t !== next) t.stop();
  });
  return stream;
}

export async function syncPeerTracks(pcs: Iterable<RTCPeerConnection>, stream: MediaStream) {
  const video = stream.getVideoTracks()[0] ?? null;
  const audio = stream.getAudioTracks()[0] ?? null;
  for (const pc of pcs) {
    for (const sender of pc.getSenders()) {
      if (sender.track?.kind === "video" && video) await sender.replaceTrack(video).catch(() => undefined);
      if (sender.track?.kind === "audio" && audio) await sender.replaceTrack(audio).catch(() => undefined);
    }
  }
}
