import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { jsonError, requireRole } from "@/lib/auth";
import { originAllowed } from "@/lib/security";
import { BEATS } from "@/lib/call-economy";
import { MEET_ORBES, PREVIEW_MINUTES } from "@/lib/constants";
import { kittyIsBusy } from "@/lib/occupancy";

const schema = z.object({
  kittyId: z.string().min(8),
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
      activity: p.activity === "CONOCER" ? `Quiere conocerte · ${PREVIEW_MINUTES} minutos` : p.activity,
      orbes: p.orbes,
      userPays: p.userPays,
      status: p.status,
      createdAt: p.createdAt,
      roomId: p.call?.roomId ?? null,
      phase: p.call?.phase ?? null,
      endsAt: p.call?.endsAt?.toISOString() ?? null,
      callStatus: p.call?.status ?? null,
      kitty: { displayName: p.kitty.user.displayName, slug: p.kitty.slug },
      user: { displayName: p.user.displayName, username: p.user.username },
    })),
  });
}

export async function POST(req: NextRequest) {
  if (!originAllowed(req)) return jsonError("Origen no permitido", 403);
  const ctx = await requireRole(["USER"]);
  if (!ctx) return jsonError("Solo users pueden pagar por conocerla", 403);
  const body = schema.safeParse(await req.json().catch(() => null));
  if (!body.success) return jsonError("Kitty inválida");

  const kitty = await db.kittyProfile.findUnique({ where: { id: body.data.kittyId } });
  if (!kitty) return jsonError("Kitty no existe", 404);
  if (await kittyIsBusy(kitty.id)) {
    return jsonError("Ella está en otra noche ahora");
  }

  const split = BEATS.meet();
  const wallet = await db.wallet.findUnique({ where: { userId: ctx.user.id } });
  if (!wallet || wallet.balance < split.userPays) return jsonError("Necesitas 1 orbe para conocerla");

  const existing = await db.proposal.findFirst({
    where: { userId: ctx.user.id, kittyId: kitty.id, status: "PENDING" },
  });
  if (existing) return jsonError("Ella ya tiene tu pedido de conocerla");

  const proposal = await db.proposal.create({
    data: {
      userId: ctx.user.id,
      kittyId: kitty.id,
      activity: "CONOCER",
      orbes: MEET_ORBES,
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
        title: `${ctx.user.displayName} quiere conocerte`,
        body: `1 orbe · ${PREVIEW_MINUTES} minutos para conocerla. Si hay chispa, él puede crear sala.`,
        href: "/studio",
      },
    });
  }

  return NextResponse.json({ ok: true, proposalId: proposal.id, split });
}
