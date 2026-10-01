import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { jsonError, requireRole } from "@/lib/auth";
import { originAllowed } from "@/lib/security";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!originAllowed(req)) return jsonError("Origen no permitido", 403);
  const ctx = await requireRole(["ADMIN"]);
  if (!ctx) return jsonError("No autorizado", 403);
  const { id } = await params;
  const { status } = (await req.json().catch(() => ({}))) as { status?: string };
  if (status !== "ACTIVE" && status !== "REVOKED") return jsonError("Estado inválido");
  const bonus = await db.bonus.update({ where: { id }, data: { status } });
  if (status === "ACTIVE") {
    await db.notification.create({
      data: {
        userId: bonus.userId,
        title: "Bono aprobado",
        body: `${bonus.code} · ${bonus.percent}% listo para usar`,
        href: "/wallet",
      },
    });
  }
  return NextResponse.json({ ok: true });
}
