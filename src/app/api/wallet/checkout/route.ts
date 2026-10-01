import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { jsonError, requireRole } from "@/lib/auth";
import { originAllowed } from "@/lib/security";
import { ORB_COP_VALUE } from "@/lib/constants";
import { guardRate } from "@/lib/api-guard";

const schema = z.object({
  orbes: z.number().int().min(1).max(500),
  method: z.enum(["card", "nequi", "daviplata", "paypal"]),
});

export async function POST(req: NextRequest) {
  if (!originAllowed(req)) return jsonError("Origen no permitido", 403);
  const limited = guardRate(req, "checkout", 10, 60_000);
  if (limited) return limited;
  const ctx = await requireRole(["USER"]);
  if (!ctx) return jsonError("No autorizado", 403);
  const body = schema.safeParse(await req.json().catch(() => null));
  if (!body.success) return jsonError("Checkout inválido");

  const wallet = await db.wallet.upsert({
    where: { userId: ctx.user.id },
    update: { balance: { increment: body.data.orbes } },
    create: { userId: ctx.user.id, balance: body.data.orbes },
  });
  await db.orbeTransaction.create({
    data: {
      walletId: wallet.id,
      type: "PURCHASE",
      orbes: body.data.orbes,
      copValue: body.data.orbes * ORB_COP_VALUE,
      note: `Sandbox ${body.data.method}`,
      meta: JSON.stringify({ phase: 2, method: body.data.method, charged: false }),
    },
  });
  return NextResponse.json({ ok: true, balance: wallet.balance });
}
