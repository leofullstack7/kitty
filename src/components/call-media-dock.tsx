"use client";

import { useEffect, useState } from "react";
import { listCallDevices, replaceAudioDevice, replaceVideoDevice, type CallDevices } from "@/lib/webrtc";

export function CallMediaDock({
  stream,
  mirrored,
  onMirror,
  onStreamChange,
}: {
  stream: MediaStream | null;
  mirrored: boolean;
  onMirror: (next: boolean) => void;
  onStreamChange: (stream: MediaStream) => Promise<void>;
}) {
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const [facing, setFacing] = useState<"user" | "environment">("user");
  const [open, setOpen] = useState(false);
  const [devices, setDevices] = useState<CallDevices>({ cameras: [], mics: [], speakers: [] });
  const [cameraId, setCameraId] = useState("");
  const [micId, setMicId] = useState("");
  const [speakerId, setSpeakerId] = useState("");
  const [note, setNote] = useState("");

  useEffect(() => {
    if (!stream) return;
    setMicOn(stream.getAudioTracks().every((t) => t.enabled));
    setCamOn(stream.getVideoTracks().every((t) => t.enabled));
  }, [stream]);

  async function refreshDevices() {
    const next = await listCallDevices().catch(() => ({ cameras: [], mics: [], speakers: [] }));
    setDevices(next);
    const cam = stream?.getVideoTracks()[0]?.getSettings().deviceId ?? "";
    const mic = stream?.getAudioTracks()[0]?.getSettings().deviceId ?? "";
    setCameraId(cam);
    setMicId(mic);
  }

  function toggleMic() {
    if (!stream) return;
    const next = !micOn;
    stream.getAudioTracks().forEach((t) => {
      t.enabled = next;
    });
    setMicOn(next);
  }

  function toggleCam() {
    if (!stream) return;
    const next = !camOn;
    stream.getVideoTracks().forEach((t) => {
      t.enabled = next;
    });
    setCamOn(next);
  }

  async function flipCam() {
    if (!stream) return;
    const next = facing === "user" ? "environment" : "user";
    try {
      await replaceVideoDevice(stream, { facingMode: { exact: next }, width: { ideal: 720 }, height: { ideal: 1280 } });
      setFacing(next);
      if (next === "environment") onMirror(false);
      else onMirror(true);
      await onStreamChange(stream);
    } catch {
      try {
        await replaceVideoDevice(stream, { facingMode: next });
        setFacing(next);
        onMirror(next === "user");
        await onStreamChange(stream);
      } catch {
        setNote("Este dispositivo no deja voltear la cámara");
      }
    }
  }

  async function pickCamera(id: string) {
    if (!stream || !id) return;
    setCameraId(id);
    await replaceVideoDevice(stream, { deviceId: { exact: id }, width: { ideal: 720 }, height: { ideal: 1280 } });
    await onStreamChange(stream);
  }

  async function pickMic(id: string) {
    if (!stream || !id) return;
    setMicId(id);
    await replaceAudioDevice(stream, id);
    await onStreamChange(stream);
  }

  async function pickSpeaker(id: string) {
    setSpeakerId(id);
    const videos = document.querySelectorAll<HTMLVideoElement>("video");
    for (const el of videos) {
      if (el.muted) continue;
      const sink = el as HTMLVideoElement & { setSinkId?: (id: string) => Promise<void> };
      if (sink.setSinkId) await sink.setSinkId(id).catch(() => undefined);
    }
  }

  return (
    <>
      <div className="flex flex-wrap items-center justify-center gap-2">
        <button type="button" className={`media-chip ${micOn ? "" : "media-chip-off"}`} onClick={toggleMic}>
          {micOn ? "Mic" : "Mic off"}
        </button>
        <button type="button" className={`media-chip ${camOn ? "" : "media-chip-off"}`} onClick={toggleCam}>
          {camOn ? "Cám" : "Cám off"}
        </button>
        <button type="button" className="media-chip" onClick={() => void flipCam()}>
          Voltear
        </button>
        <button
          type="button"
          className="media-chip"
          onClick={() => {
            setOpen(true);
            void refreshDevices();
          }}
        >
          Equipo
        </button>
      </div>
      {open && (
        <div className="fixed inset-0 z-[60] grid place-items-center bg-black/75 p-4" onClick={() => setOpen(false)}>
          <div className="glass w-full max-w-md rounded-3xl p-5" onClick={(e) => e.stopPropagation()}>
            <p className="text-[10px] uppercase tracking-[0.3em] text-magenta">tu equipo</p>
            <h3 className="font-serif text-3xl">Cámara y audio</h3>
            <p className="mt-2 text-sm text-orchid/75">Como en Meet: elige cámara, micrófono, altavoz y si te ves en espejo.</p>
            <label className="mt-4 block text-xs uppercase tracking-widest text-white/50">Cámara</label>
            <select className="input-lux mt-2" value={cameraId} onChange={(e) => void pickCamera(e.target.value)}>
              {devices.cameras.map((d) => (
                <option key={d.deviceId} value={d.deviceId}>
                  {d.label || "Cámara"}
                </option>
              ))}
            </select>
            <label className="mt-4 block text-xs uppercase tracking-widest text-white/50">Micrófono</label>
            <select className="input-lux mt-2" value={micId} onChange={(e) => void pickMic(e.target.value)}>
              {devices.mics.map((d) => (
                <option key={d.deviceId} value={d.deviceId}>
                  {d.label || "Micrófono"}
                </option>
              ))}
            </select>
            {devices.speakers.length > 0 && (
              <>
                <label className="mt-4 block text-xs uppercase tracking-widest text-white/50">Altavoz</label>
                <select className="input-lux mt-2" value={speakerId} onChange={(e) => void pickSpeaker(e.target.value)}>
                  {devices.speakers.map((d) => (
                    <option key={d.deviceId} value={d.deviceId}>
                      {d.label || "Altavoz"}
                    </option>
                  ))}
                </select>
              </>
            )}
            <button type="button" className="mt-4 w-full rounded-full border border-orchid/30 py-3 text-sm" onClick={() => onMirror(!mirrored)}>
              {mirrored ? "Quitar espejo" : "Ver en espejo"}
            </button>
            {note && <p className="mt-3 text-sm text-rose-300">{note}</p>}
            <button type="button" className="mt-4 w-full rounded-full border border-orchid/30 py-3" onClick={() => setOpen(false)}>
              Listo
            </button>
          </div>
        </div>
      )}
    </>
  );
}
