import { NextRequest } from "next/server";
import { env } from "./env";

const TAG_RE = /<[^>]*>/g;
const CTRL_RE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

export function sanitizeText(input: string, max = 2000) {
  return input.replace(TAG_RE, "").replace(CTRL_RE, "").trim().slice(0, max);
}

export function getClientIp(req: NextRequest | Request) {
  const h = (req as NextRequest).headers;
  const forwarded = h.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim().slice(0, 64);
  return h.get("x-real-ip") ?? "0.0.0.0";
}

export function originAllowed(req: NextRequest | Request) {
  const origin = (req as NextRequest).headers.get("origin");
  if (!origin) return true;
  try {
    const incoming = new URL(origin);
    if (incoming.hostname === "localhost" || incoming.hostname === "127.0.0.1") return true;
    if (
      /^192\.168\.\d+\.\d+$/.test(incoming.hostname) ||
      /^10\.\d+\.\d+\.\d+$/.test(incoming.hostname) ||
      /^172\.(1[6-9]|2\d|3[0-1])\.\d+\.\d+$/.test(incoming.hostname)
    ) {
      return true;
    }
    const host = (req as NextRequest).headers.get("host");
    if (host && incoming.host === host) return true;
    return incoming.origin === new URL(process.env.APP_ORIGIN ?? env.APP_ORIGIN).origin;
  } catch {
    return false;
  }
}

export function isSafeRedirect(path: string) {
  return path.startsWith("/") && !path.startsWith("//") && !path.includes("\\");
}

export function looksLikeUsername(value: string) {
  return /^[a-zA-Z0-9_]{3,20}$/.test(value);
}

const MAGIC: Record<string, number[][]> = {
  "image/jpeg": [[0xff, 0xd8, 0xff]],
  "image/png": [[0x89, 0x50, 0x4e, 0x47]],
  "image/webp": [[0x52, 0x49, 0x46, 0x46]],
  "image/gif": [[0x47, 0x49, 0x46, 0x38]],
  "video/mp4": [[0x00, 0x00, 0x00], [0x66, 0x74, 0x79, 0x70]],
  "video/webm": [[0x1a, 0x45, 0xdf, 0xa3]],
};

export function sniffMime(buf: Buffer): string | null {
  if (buf.length >= 12 && buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") {
    return "image/webp";
  }
  if (buf.length >= 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
    return "image/png";
  }
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return "image/jpeg";
  }
  if (buf.length >= 12 && buf.toString("ascii", 4, 8) === "ftyp") return "video/mp4";
  if (buf.length >= 4 && buf[0] === 0x1a && buf[1] === 0x45 && buf[2] === 0xdf && buf[3] === 0xa3) {
    return "video/webm";
  }
  void MAGIC;
  return null;
}

export const ALLOWED_IMAGE = new Set(["image/jpeg", "image/png", "image/webp"]);
export const ALLOWED_VIDEO = new Set(["video/mp4", "video/webm"]);
export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
export const MAX_VIDEO_BYTES = 40 * 1024 * 1024;
