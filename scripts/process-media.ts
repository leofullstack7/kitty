import { existsSync } from "fs";
import path from "path";
import sharp from "sharp";
import { mkdir } from "fs/promises";

async function webpSquare(input: string, output: string, size: number) {
  if (existsSync(output)) return;
  await mkdir(path.dirname(output), { recursive: true });
  await sharp(input).resize(size, size, { fit: "cover" }).webp({ quality: 82 }).toFile(output);
}

async function webpWidth(input: string, output: string, width: number) {
  if (existsSync(output)) return;
  await mkdir(path.dirname(output), { recursive: true });
  await sharp(input).resize({ width, withoutEnlargement: true }).webp({ quality: 78 }).toFile(output);
}

export async function processStaticMedia() {
  const publicDir = path.join(process.cwd(), "public");
  const processed = path.join(publicDir, "media", "processed");

  const kittys = [
    { file: "kitty-agatta.png", slug: "agatta" },
    { file: "kitty-luna.png", slug: "luna" },
    { file: "kitty-violeta.png", slug: "violeta" },
    { file: "kitty-nova.png", slug: "nova" },
    { file: "kitty-mika.png", slug: "mika" },
  ];

  for (const k of kittys) {
    const src = path.join(publicDir, "media", "kittys", k.file);
    if (!existsSync(src)) continue;
    await webpSquare(src, path.join(processed, k.slug, "card.webp"), 800);
    await webpSquare(src, path.join(processed, k.slug, "mobile.webp"), 720);
    await webpSquare(src, path.join(processed, k.slug, "desktop.webp"), 1400);
  }
  const agattaFull = path.join(publicDir, "media", "kittys", "agatta-full.png");
  if (existsSync(agattaFull)) {
    await webpWidth(agattaFull, path.join(processed, "agatta", "cover.webp"), 1400);
  }

  const heroes = [
    ["hero-welcome-desktop.png", "welcome-d.webp", 1920],
    ["hero-welcome-mobile.png", "welcome-m.webp", 900],
    ["hero-agatta-desktop.png", "agatta-d.webp", 1920],
    ["hero-agatta-mobile.png", "agatta-m.webp", 900],
    ["hero-orbes-desktop.png", "orbes-d.webp", 1920],
    ["hero-orbes-mobile.png", "orbes-m.webp", 900],
    ["hero-live-desktop.png", "live-d.webp", 1920],
    ["hero-live-mobile.png", "live-m.webp", 900],
  ] as const;
  for (const [srcName, outName, w] of heroes) {
    const src = path.join(publicDir, "media", "heroes", srcName);
    if (!existsSync(src)) continue;
    await webpWidth(src, path.join(processed, "heroes", outName), w);
  }
  const orbe = path.join(publicDir, "media", "brand", "orbe.png");
  const logo = path.join(publicDir, "media", "brand", "logo-kitty.png");
  if (existsSync(orbe)) await webpSquare(orbe, path.join(processed, "brand", "orbe.webp"), 256);
  if (existsSync(logo)) await webpSquare(logo, path.join(processed, "brand", "logo.webp"), 256);
}

if (process.argv[1]?.includes("process-media")) {
  processStaticMedia()
    .then(() => console.log("media processed"))
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
