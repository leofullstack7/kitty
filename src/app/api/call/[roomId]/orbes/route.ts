import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { jsonError, requireRole } from "@/lib/auth";
import { originAllowed, sanitizeText } from "@/lib/security";
import { splitOrbes } from "@/lib/bonuses";
import { ORB_COP_VALUE, ORBE_PACKS } from "@/lib/constants";
import { moderateText } from "@/lib/claude";

const allowed = new Set<number>(ORBE_PACKS.map((p) => p.orbes));
const schema = z.object({
  orbes: z.number().int(),
  activity: z.string().min(2).max(80),
});

export async function POST(req: NextRequest, { params }: { params: Promise<{ roomId: string }> }) {
  if (!originAllowed(req)) return jsonError("Origen no permitido", 403);
  const ctx = await requireRole(["USER"]);
  if (!ctx) return jsonError("No autorizado", 403);
  const { roomId } = await params;
  const body = schema.safeParse(await req.json().catch(() => null));
  if (!body.success || !allowed.has(body.data.orbes)) return jsonError("Pack de orbes inválido");
  const activity = sanitizeText(body.data.activity, 80);
  const mod = await moderateText(activity, "activity");
  if (!mod.allowed) return jsonError("Actividad no permitida");

  const call = await db.callSession.findUnique({ where: { roomId }, include: { user: { include: { wallet: true } } } });
  if (!call || call.userId !== ctx.user.id) return jsonError("Sala no válida", 404);
  const split = splitOrbes(body.data.orbes, 0);
  if (!split.valid) return jsonError(split.reason ?? "Split inválido");
  const wallet = call.user.wallet;
  if (!wallet || wallet.balance < split.userPays) return jsonError("Sin orbes suficientes");

  await db.$transaction(async (tx) => {
    await tx.wallet.update({ where: { id: wallet.id }, data: { balance: { decrement: split.userPays } } });
    await tx.orbeTransaction.create({
      data: {
        walletId: wallet.id,
        type: "SPEND",
        orbes: -split.userPays,
        copValue: split.userPays * ORB_COP_VALUE,
        note: `Burst en sala ${roomId}`,
        meta: JSON.stringify(split),
      },
    });
    await tx.orbeBurst.create({
      data: { callId: call.id, orbes: split.original, activity: mod.rewritten },
    });
  });
  return NextResponse.json({ ok: true, split });
}
