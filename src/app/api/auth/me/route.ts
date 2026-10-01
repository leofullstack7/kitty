import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";

export async function GET() {
  const ctx = await requireSession();
  if (!ctx) return NextResponse.json({ me: null }, { status: 401 });

  const wallet = await db.wallet.findUnique({
    where: { userId: ctx.user.id },
    select: { id: true, balance: true },
  });
  const groups = wallet
    ? await db.orbeTransaction.groupBy({
        by: ["type"],
        where: { walletId: wallet.id },
        _sum: { copValue: true },
      })
    : [];
  const sum = (type: string) => Math.abs(groups.find((g) => g.type === type)?._sum.copValue ?? 0);

  return NextResponse.json({
    me: {
      id: ctx.user.id,
      username: ctx.user.username,
      role: ctx.user.role,
      displayName: ctx.user.displayName,
      balance: wallet?.balance ?? ctx.user.wallet?.balance ?? 0,
      kittySlug: ctx.user.kittyProfile?.slug ?? null,
      available: ctx.user.kittyProfile?.isAvailable ?? false,
      investedCop: sum("PURCHASE"),
      spentCop: sum("SPEND"),
      earnedCop: sum("EARN"),
      sentCop: sum("TRANSFER"),
    },
  });
}
