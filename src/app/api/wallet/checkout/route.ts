import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { jsonError, requireRole } from "@/lib/auth";
import { originAllowed } from "@/lib/security";
import { ORB_COP_VALUE } from "@/lib/constants";
import { guardRate } from "@/lib/api-guard";
import { METHOD_IDS, checkoutPayload, countryOf, detectCountry, isMethodAllowed, priceFor } from "@/lib/payments";

const schema = z.object({
  orbes: z.number().int().min(1).max(500),
  method: z.string().refine((id) => METHOD_IDS.includes(id), "Método inválido"),
  country: z.string().min(2).max(4).optional(),
});

export async function GET(req: NextRequest) {
  return NextResponse.json(checkoutPayload(detectCountry(req)));
}

export async function POST(req: NextRequest) {
  if (!originAllowed(req)) return jsonError("Origen no permitido", 403);
  const limited = guardRate(req, "checkout", 10, 60_000);
  if (limited) return limited;
  const ctx = await requireRole(["USER"]);
  if (!ctx) return jsonError("Solo los invitados recargan orbes", 403);
  const body = schema.safeParse(await req.json().catch(() => null));
  if (!body.success) return jsonError("Checkout inválido");

  const country = body.data.country ? countryOf(body.data.country) : detectCountry(req);
  if (!isMethodAllowed(country.code, body.data.method)) {
    return jsonError(`Ese método no está disponible en ${country.name}`);
  }

  const price = priceFor(body.data.orbes, country);
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
      copValue: price.cop,
      note: `Recarga ${body.data.method} · ${country.code}`,
      meta: JSON.stringify({
        sandbox: true,
        charged: false,
        method: body.data.method,
        country: country.code,
        currency: country.currency,
        localAmount: price.local,
      }),
    },
  });
  return NextResponse.json({
    ok: true,
    balance: wallet.balance,
    paid: price.label,
    method: body.data.method,
    country: country.code,
  });
}
