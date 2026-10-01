import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { jsonError, requireRole } from "@/lib/auth";
import { originAllowed } from "@/lib/security";
import { ORB_COP_VALUE } from "@/lib/constants";

const schema = z.object({ orbes: z.number().int().min(1).max(500) });

export async function POST(req: NextRequest, { params }: { params: Promise<{ roomId: string }> }) {
  if (!originAllowed(req)) return jsonError("Origen no permitido", 403);
  const ctx = await requireRole(["KITTY", "ADMIN"]);
  if (!ctx?.user.kittyProfile) return jsonError("No autorizado", 403);
  const { roomId } = await params;
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError("Cantidad inválida");

  const call = await db.callSession.findUnique({
    where: { roomId },
    include: {
      kitty: { include: { user: { include: { wallet: true } } } },
      guestKitty: { include: { user: { include: { wallet: true } } } },
    },
  });
  if (!call) return jsonError("Sala no válida", 404);
  if (ctx.user.role === "KITTY" && call.kittyId !== ctx.user.kittyProfile.id) {
    return jsonError("Solo la anfitriona puede enviar orbes", 403);
  }
  if (!call.guestKitty) return jsonError("No hubo otra Kitty en esta noche");

  const hostWallet =
    call.kitty.user.wallet ?? (await db.wallet.create({ data: { userId: call.kitty.userId, balance: 0 } }));
  const guestWallet =
    call.guestKitty.user.wallet ?? (await db.wallet.create({ data: { userId: call.guestKitty.userId, balance: 0 } }));

  if (hostWallet.balance < parsed.data.orbes) return jsonError("No te alcanzan los orbes para enviárselos");

  await db.$transaction(async (tx) => {
    await tx.wallet.update({
      where: { id: hostWallet.id },
      data: { balance: { decrement: parsed.data.orbes } },
    });
    await tx.orbeTransaction.create({
      data: {
        walletId: hostWallet.id,
        type: "TRANSFER",
        orbes: -parsed.data.orbes,
        copValue: parsed.data.orbes * ORB_COP_VALUE,
        note: `Propina a ${call.guestKitty!.user.displayName} por la noche`,
        meta: JSON.stringify({ roomId, guestKittyId: call.guestKittyId }),
      },
    });
    await tx.wallet.update({
      where: { id: guestWallet.id },
      data: { balance: { increment: parsed.data.orbes } },
    });
    await tx.orbeTransaction.create({
      data: {
        walletId: guestWallet.id,
        type: "EARN",
        orbes: parsed.data.orbes,
        copValue: parsed.data.orbes * ORB_COP_VALUE,
        note: `Participación en la noche de ${call.kitty.user.displayName}`,
        meta: JSON.stringify({ roomId, hostKittyId: call.kittyId }),
      },
    });
    await tx.notification.create({
      data: {
        userId: call.guestKitty!.userId,
        title: `${call.kitty.user.displayName} te envió orbes`,
        body: `${parsed.data.orbes} orbes por haber estado en su noche.`,
        href: "/wallet",
      },
    });
  });

  return NextResponse.json({ ok: true, orbes: parsed.data.orbes });
}
