import { spawn } from "child_process";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import sharp from "sharp";
import { ALLOWED_IMAGE, ALLOWED_VIDEO, MAX_IMAGE_BYTES, MAX_VIDEO_BYTES, sniffMime } from "./security";
import { persistPublicFile } from "./supabase-admin";

const UPLOAD_ROOT = path.join(process.cwd(), "public", "media", "processed");
const ORIGINAL_ROOT = path.join(process.cwd(), "uploads", "originals");

function ffmpegAvailable() {
  return new Promise<boolean>((resolve) => {
    const p = spawn("ffmpeg", ["-version"]);
    p.on("error", () => resolve(false));
    p.on("close", (code) => resolve(code === 0));
  });
}

function run(cmd: string, args: string[]) {
  return new Promise<void>((resolve, reject) => {
    const p = spawn(cmd, args, { windowsHide: true });
    let err = "";
    p.stderr.on("data", (d) => (err += d.toString()));
    p.on("error", reject);
    p.on("close", (code) => (code === 0 ? resolve() : reject(new Error(err.slice(0, 400)))));
  });
}

export async function processUpload(file: File, slug: string) {
  const buf = Buffer.from(await file.arrayBuffer());
  const mime = sniffMime(buf);
  if (!mime) throw new Error("Archivo no reconocido. Solo JPG, PNG, WEBP, MP4 o WEBM.");

  const isImage = ALLOWED_IMAGE.has(mime);
  const isVideo = ALLOWED_VIDEO.has(mime);
  if (!isImage && !isVideo) throw new Error("Tipo no permitido.");
  if (isImage && buf.length > MAX_IMAGE_BYTES) throw new Error("Imagen demasiado pesada (máx 8MB).");
  if (isVideo && buf.length > MAX_VIDEO_BYTES) throw new Error("Video demasiado pesado (máx 40MB).");

  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const origDir = path.join(ORIGINAL_ROOT, slug);
  const outDir = path.join(UPLOAD_ROOT, slug);
  await mkdir(origDir, { recursive: true });
  await mkdir(outDir, { recursive: true });
  await writeFile(path.join(origDir, `${id}.bin`), buf);

  if (isImage) {
    const mBuf = await sharp(buf).rotate().resize(720, 720, { fit: "cover" }).webp({ quality: 78 }).toBuffer();
    const dBuf = await sharp(buf).rotate().resize(1400, 1400, { fit: "cover" }).webp({ quality: 82 }).toBuffer();
    const cBuf = await sharp(buf).rotate().resize(800, 800, { fit: "cover" }).webp({ quality: 80 }).toBuffer();
    await writeFile(path.join(outDir, `${id}-m.webp`), mBuf);
    await writeFile(path.join(outDir, `${id}-d.webp`), dBuf);
    await writeFile(path.join(outDir, `${id}-c.webp`), cBuf);
    const mobile =
      (await persistPublicFile(`processed/${slug}/${id}-m.webp`, mBuf, "image/webp")) ?? `/media/processed/${slug}/${id}-m.webp`;
    const desktop =
      (await persistPublicFile(`processed/${slug}/${id}-d.webp`, dBuf, "image/webp")) ?? `/media/processed/${slug}/${id}-d.webp`;
    const card =
      (await persistPublicFile(`processed/${slug}/${id}-c.webp`, cBuf, "image/webp")) ?? `/media/processed/${slug}/${id}-c.webp`;
    const meta = await sharp(buf).metadata();
    return {
      type: "IMAGE" as const,
      webPath: card,
      mobilePath: mobile,
      desktopPath: desktop,
      posterPath: card,
      mime: "image/webp",
      bytes: buf.length,
      width: meta.width ?? 800,
      height: meta.height ?? 800,
      processed: true,
      originalName: file.name.slice(0, 80),
    };
  }

  const hasFf = await ffmpegAvailable();
  const mp4Name = `${id}.mp4`;
  const posterName = `${id}-poster.webp`;
  if (hasFf) {
    const tmpIn = path.join(origDir, `${id}.bin`);
    const tmpOut = path.join(outDir, mp4Name);
    const poster = path.join(outDir, posterName);
    await run("ffmpeg", [
      "-y", "-i", tmpIn, "-vf", "scale='min(1280,iw)':-2", "-c:v", "libx264", "-pix_fmt", "yuv420p",
      "-preset", "veryfast", "-crf", "28", "-c:a", "aac", "-b:a", "96k", "-movflags", "+faststart", tmpOut,
    ]);
    await run("ffmpeg", ["-y", "-i", tmpOut, "-ss", "00:00:01", "-frames:v", "1", poster]);
  } else {
    await writeFile(path.join(outDir, mp4Name), buf);
  }

  return {
    type: "VIDEO" as const,
    webPath: `/media/processed/${slug}/${mp4Name}`,
    mobilePath: `/media/processed/${slug}/${mp4Name}`,
    desktopPath: `/media/processed/${slug}/${mp4Name}`,
    posterPath: hasFf ? `/media/processed/${slug}/${posterName}` : null,
    mime: "video/mp4",
    bytes: buf.length,
    width: null as number | null,
    height: null as number | null,
    processed: hasFf,
    originalName: file.name.slice(0, 80),
  };
}

export async function optimizeStatic(inputAbs: string, outputAbs: string, size: number) {
  await mkdir(path.dirname(outputAbs), { recursive: true });
  await sharp(inputAbs).resize(size, size, { fit: "cover" }).webp({ quality: 80 }).toFile(outputAbs);
}

export async function optimizeHero(inputAbs: string, outputAbs: string, width: number) {
  await mkdir(path.dirname(outputAbs), { recursive: true });
  await sharp(inputAbs).resize({ width, withoutEnlargement: true }).webp({ quality: 78 }).toFile(outputAbs);
}
