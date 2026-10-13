import type { SignalData } from "./call-channel";

export type HeldCall = {
  roomId: string;
  userId: string;
  stream: MediaStream;
  peers: Map<string, RTCPeerConnection>;
  pendingIce: Map<string, RTCIceCandidateInit[]>;
  peerBorn: Map<string, number>;
  seenSignals: Set<string>;
  iceServers: RTCIceServer[];
};

let held: HeldCall | null = null;
let stopKeepalive: (() => void) | null = null;

function keepHeldAlive() {
  if (stopKeepalive) return;
  stopKeepalive = armCallBackground({
    video: () => document.querySelector("video"),
    onVisible: () => undefined,
  });
}

function stopHeldAlive() {
  stopKeepalive?.();
  stopKeepalive = null;
}

function release(call: HeldCall) {
  call.stream.getTracks().forEach((track) => track.stop());
  call.peers.forEach((pc) => pc.close());
  call.peers.clear();
}

export function holdCall(next: HeldCall | null) {
  if (!next?.stream) return;
  if (held && held.stream !== next.stream) release(held);
  held = next;
  keepHeldAlive();
}

export function takeHeld(roomId: string, userId: string) {
  if (!held || held.roomId !== roomId || held.userId !== userId) return null;
  const current = held;
  held = null;
  stopHeldAlive();
  return current;
}

export function dropHeld() {
  stopHeldAlive();
  if (!held) return;
  release(held);
  held = null;
}

export function signalKey(from: string, data: SignalData) {
  if (data.sdp) return `${from}:sdp:${data.sdp.type}:${data.sdp.sdp ?? ""}`;
  return `${from}:ice:${data.candidate?.candidate ?? ""}:${data.candidate?.sdpMid ?? ""}:${data.candidate?.sdpMLineIndex ?? ""}`;
}

export function armCallBackground(opts: {
  video: () => HTMLVideoElement | null;
  onVisible: () => void;
}) {
  let audio: AudioContext | null = null;
  let oscillator: OscillatorNode | null = null;
  let wake: WakeLockSentinel | null = null;
  let stopped = false;
  let sawHide = false;

  async function keepAlive() {
    if (stopped) return;
    try {
      if (!audio) audio = new AudioContext();
      if (audio.state === "suspended") await audio.resume();
      if (!oscillator && audio.state === "running") {
        const gain = audio.createGain();
        gain.gain.value = 0.0001;
        oscillator = audio.createOscillator();
        oscillator.frequency.value = 180;
        oscillator.connect(gain);
        gain.connect(audio.destination);
        oscillator.start();
      }
    } catch {
      /* el navegador no dejó el audio de fondo */
    }
    try {
      if (!wake && navigator.wakeLock) wake = await navigator.wakeLock.request("screen");
    } catch {
      /* sin wake lock */
    }
    if ("mediaSession" in navigator) {
      try {
        navigator.mediaSession.metadata = new MediaMetadata({ title: "Kitty", artist: "Videollamada en vivo" });
        navigator.mediaSession.playbackState = "playing";
      } catch {
        /* metadata opcional */
      }
    }
  }

  async function onHide() {
    const el = opts.video();
    if (!el || !document.pictureInPictureEnabled || document.pictureInPictureElement === el) return;
    try {
      await el.requestPictureInPicture();
    } catch {
      /* PiP no disponible en este celular */
    }
  }

  function onVisibility() {
    if (document.visibilityState === "hidden") {
      sawHide = true;
      void onHide();
      return;
    }
    void keepAlive();
    if (sawHide) opts.onVisible();
  }

  function onPageShow(ev: PageTransitionEvent) {
    void keepAlive();
    if (ev.persisted) opts.onVisible();
  }

  document.addEventListener("visibilitychange", onVisibility);
  window.addEventListener("pageshow", onPageShow);
  void keepAlive();

  return () => {
    stopped = true;
    document.removeEventListener("visibilitychange", onVisibility);
    window.removeEventListener("pageshow", onPageShow);
    oscillator?.stop();
    oscillator = null;
    void audio?.close().catch(() => undefined);
    void wake?.release().catch(() => undefined);
  };
}
