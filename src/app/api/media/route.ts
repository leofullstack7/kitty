import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { jsonError, requireRole } from "@/lib/auth";
import { originAllowed } from "@/lib/security";
import { processUpload } from "@/lib/media";
import { guardRate } from "@/lib/api-guard";

export async function POST(req: NextRequest) {
  if (!originAllowed(req)) return jsonError("Origen no permitido", 403);
  const limited = guardRate(req, "media", 8, 60_000);
  if (limited) return limited;
  const ctx = await requireRole(["KITTY", "ADMIN"]);
  if (!ctx) return jsonError("No autorizado", 403);
  const kitty = ctx.user.kittyProfile ?? (await db.kittyProfile.findFirst({ where: { slug: "agatta" } }));
  if (!kitty) return jsonError("Sin perfil kitty");
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return jsonError("Archivo requerido");
  try {
    const processed = await processUpload(file, kitty.slug);
    const asset = await db.mediaAsset.create({
      data: {
        kittyId: kitty.id,
        type: processed.type,
        originalName: processed.originalName,
        webPath: processed.webPath,
        mobilePath: processed.mobilePath,
        desktopPath: processed.desktopPath,
        posterPath: processed.posterPath,
        mime: processed.mime,
        bytes: processed.bytes,
        width: processed.width,
        height: processed.height,
        processed: processed.processed,
      },
    });
    return NextResponse.json({ ok: true, asset });
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "No se pudo procesar");
  }
}
