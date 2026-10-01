import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { jsonError, requireRole } from "@/lib/auth";
import { originAllowed, sanitizeText } from "@/lib/security";
import { moderateText } from "@/lib/claude";
import { splitOrbes } from "@/lib/bonuses";
import { ORB_COP_VALUE } from "@/lib/constants";

const schema = z.object({
  kittyId: z.string().min(8),
  activity: z.string().min(8).max(500),
  orbes: z.number().int().min(1).max(500),
  bonusId: z.string().nullable().optional(),
});

export async function GET() {
  const ctx = await requireRole(["USER", "KITTY", "ADMIN"]);
  if (!ctx) return jsonError("No autenticado", 401);
  const where = ctx.user.role === "USER" ? { userId: ctx.user.id } : ctx.user.role === "KITTY" ? { kittyId: ctx.user.kittyProfile?.id ?? "__none__" } : {};
  const proposals = await db.proposal.findMany({
    where,
    include: {
      user: true,
      kitty: { include: { user: true } },
      call: true,
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  return NextResponse.json({
    proposals: proposals.map((p) => ({
      id: p.id,
      activity: p.activity,
      orbes: p.orbes,
      userPays: p.userPays,
      status: p.status,
      createdAt: p.createdAt,
      roomId: p.call?.roomId ?? null,
      kitty: { displayName: p.kitty.user.displayName, slug: p.kitty.slug },
      user: { displayName: p.user.displayName, username: p.user.username },
    })),
  });
}

export async function POST(req: NextRequest) {
  if (!originAllowed(req)) return jsonError("Origen no permitido", 403);
  const ctx = await requireRole(["USER"]);
  if (!ctx) return jsonError("Solo users envían JOIN", 403);
  const body = schema.safeParse(await req.json().catch(() => null));
  if (!body.success) return jsonError("JOIN inválido");
  const activity = sanitizeText(body.data.activity, 500);
  const mod = await moderateText(activity, "activity");
  if (!mod.allowed) return jsonError("Esa actividad no está permitida");

  const kitty = await db.kittyProfile.findUnique({ where: { id: body.data.kittyId } });
  if (!kitty) return jsonError("Kitty no existe", 404);

  let percent = 0;
  let bonusId: string | null = null;
  if (body.data.bonusId) {
    const bonus = await db.bonus.findFirst({
      where: {
        id: body.data.bonusId,
        userId: ctx.user.id,
        kittyId: kitty.id,
        status: "ACTIVE",
        expiresAt: { gt: new Date() },
      },
    });
    if (!bonus) return jsonError("Bono no válido para esta Kitty");
    percent = bonus.percent;
    bonusId = bonus.id;
  }

  const split = splitOrbes(body.data.orbes, percent);
  if (!split.valid) return jsonError(split.reason ?? "Split inválido");

  const wallet = await db.wallet.findUnique({ where: { userId: ctx.user.id } });
  if (!wallet || wallet.balance < split.userPays) return jsonError("No te alcanzan los orbes");

  const proposal = await db.proposal.create({
    data: {
      userId: ctx.user.id,
      kittyId: kitty.id,
      activity: mod.rewritten,
      orbes: split.original,
      bonusId,
      userPays: split.userPays,
      platformFee: split.platformFee,
      kittyNet: split.kittyNet,
    },
  });

  const kittyUser = await db.user.findUnique({ where: { id: kitty.userId } });
  if (kittyUser) {
    await db.notification.create({
      data: {
        userId: kittyUser.id,
        title: `JOIN de ${ctx.user.displayName}`,
        body: `${split.original} orbes · ${mod.rewritten.slice(0, 80)}`,
        href: "/studio",
      },
    });
  }

  void ORB_COP_VALUE;
  return NextResponse.json({ ok: true, proposalId: proposal.id, split });
}
