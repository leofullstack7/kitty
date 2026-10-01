import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { jsonError, requireRole, requireSession } from "@/lib/auth";
import { originAllowed } from "@/lib/security";
import { splitOrbes } from "@/lib/bonuses";
import { ORB_COP_VALUE } from "@/lib/constants";
import { listTips } from "@/lib/tips";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ roomId: string }> }) {
  const ctx = await requireSession();
  if (!ctx) return jsonError("No autenticado", 401);
  const { roomId } = await params;
  const call = await db.callSession.findUnique({ where: { roomId }, select: { kittyId: true, userId: true, guestKittyId: true, kitty: { select: { userId: true } }, guestKitty: { select: { userId: true } } } });
  if (!call) return jsonError("Sala no válida", 404);
  const allowed =
    ctx.user.id === call.userId ||
    ctx.user.id === call.kitty.userId ||
    ctx.user.id === call.guestKitty?.userId ||
    ctx.user.role === "ADMIN";
  if (!allowed) return jsonError("No estás en esta noche", 403);
  const tips = await listTips(call.kittyId, true);
  return NextResponse.json({ tips: tips.map((t) => ({ id: t.id, title: t.title, orbes: t.orbes })) });
}

const schema = z.object({ tipId: z.string().min(8) });

export async function POST(req: NextRequest, { params }: { params: Promise<{ roomId: string }> }) {
  if (!originAllowed(req)) return jsonError("Origen no permitido", 403);
  const ctx = await requireRole(["USER"]);
  if (!ctx) return jsonError("No autorizado", 403);
  const { roomId } = await params;
  const body = schema.safeParse(await req.json().catch(() => null));
  if (!body.success) return jsonError("Elige una acción del menú");

  const call = await db.callSession.findUnique({
    where: { roomId },
    include: {
      kitty: { include: { user: { include: { wallet: true } } } },
      user: { include: { wallet: true } },
    },
  });
  if (!call || call.userId !== ctx.user.id || call.status === "ENDED") return jsonError("Sala no válida", 404);

  const tip = await db.kittyTip.findFirst({
    where: { id: body.data.tipId, kittyId: call.kittyId, active: true },
  });
  if (!tip) return jsonError("Esa acción ya no está en su menú");

  const split = splitOrbes(tip.orbes, 0);
  if (!split.valid) return jsonError(split.reason ?? "Orbes inválidos");
  const wallet = call.user.wallet;
  if (!wallet || wallet.balance < split.userPays) return jsonError("Sin orbes suficientes");

  const kittyWallet =
    call.kitty.user.wallet ?? (await db.wallet.create({ data: { userId: call.kitty.userId, balance: 0 } }));

  await db.$transaction(async (tx) => {
    await tx.wallet.update({
      where: { id: wallet.id },
      data: { balance: { decrement: split.userPays } },
    });
    await tx.orbeTransaction.create({
      data: {
        walletId: wallet.id,
        type: "SPEND",
        orbes: -split.userPays,
        copValue: split.userPays * ORB_COP_VALUE,
        note: `Menú · ${tip.title}`,
        meta: JSON.stringify({ tipId: tip.id, roomId }),
      },
    });
    await tx.wallet.update({
      where: { id: kittyWallet.id },
      data: { balance: { increment: split.kittyNet } },
    });
    await tx.orbeTransaction.create({
      data: {
        walletId: kittyWallet.id,
        type: "EARN",
        orbes: split.kittyNet,
        copValue: split.kittyNet * ORB_COP_VALUE,
        note: `Menú · ${tip.title}`,
        meta: JSON.stringify({ tipId: tip.id, roomId }),
      },
    });
    await tx.orbeBurst.create({
      data: { callId: call.id, orbes: tip.orbes, activity: tip.title },
    });
  });

  return NextResponse.json({ ok: true, title: tip.title, orbes: tip.orbes });
}
