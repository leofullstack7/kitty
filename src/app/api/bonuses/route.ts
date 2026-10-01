import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { jsonError, requireRole } from "@/lib/auth";
import { originAllowed, sanitizeText } from "@/lib/security";
import { bonusExpiresAt, bonusNeedsApproval, randomCode, splitOrbes } from "@/lib/bonuses";
import { MAX_BONUS_PERCENT } from "@/lib/constants";

const schema = z.object({
  userId: z.string().min(8),
  percent: z.number().int().min(1).max(MAX_BONUS_PERCENT),
  note: z.string().max(200).optional(),
});

export async function GET(req: NextRequest) {
  const ctx = await requireRole(["USER", "KITTY", "ADMIN"]);
  if (!ctx) return jsonError("No autenticado", 401);
  const kittyId = req.nextUrl.searchParams.get("kittyId");
  if (kittyId && ctx.user.role === "USER") {
    const bonuses = await db.bonus.findMany({
      where: { userId: ctx.user.id, kittyId, status: "ACTIVE", expiresAt: { gt: new Date() } },
      select: { id: true, percent: true, code: true, expiresAt: true },
      orderBy: { createdAt: "desc" },
      take: 8,
    });
    return NextResponse.json({ bonuses });
  }
  const where =
    ctx.user.role === "USER"
      ? { userId: ctx.user.id }
      : ctx.user.role === "KITTY"
        ? { kittyId: ctx.user.kittyProfile?.id ?? "__none__" }
        : {};
  const bonuses = await db.bonus.findMany({
    where,
    select: {
      id: true,
      percent: true,
      code: true,
      status: true,
      expiresAt: true,
      kitty: { select: { user: { select: { displayName: true } } } },
      user: { select: { displayName: true } },
    },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({ bonuses });
}

export async function POST(req: NextRequest) {
  if (!originAllowed(req)) return jsonError("Origen no permitido", 403);
  const ctx = await requireRole(["KITTY"]);
  if (!ctx?.user.kittyProfile) return jsonError("No autorizado", 403);
  const body = schema.safeParse(await req.json().catch(() => null));
  if (!body.success) return jsonError("Bono inválido (máx 25%)");
  const user = await db.user.findFirst({ where: { id: body.data.userId, role: "USER", isActive: true } });
  if (!user) return jsonError("Usuario no encontrado");
  const probe = splitOrbes(20, body.data.percent);
  if (!probe.valid) return jsonError(probe.reason ?? "Porcentaje no viable");

  const status = bonusNeedsApproval(body.data.percent) ? "PENDING_APPROVAL" : "ACTIVE";
  const bonus = await db.bonus.create({
    data: {
      kittyId: ctx.user.kittyProfile.id,
      userId: user.id,
      percent: body.data.percent,
      code: randomCode(),
      status,
      expiresAt: bonusExpiresAt(),
      note: sanitizeText(body.data.note ?? "", 200),
    },
  });
  if (status === "ACTIVE") {
    await db.notification.create({
      data: {
        userId: user.id,
        title: `${ctx.user.displayName} te regaló un bono`,
        body: `${bonus.percent}% solo con ella · ${bonus.code}`,
        href: `/k/${ctx.user.kittyProfile.slug}`,
      },
    });
  }
  return NextResponse.json({ bonus });
}
