import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { jsonError, requireRole } from "@/lib/auth";

export async function GET() {
  const ctx = await requireRole(["USER", "KITTY", "ADMIN"]);
  if (!ctx) return jsonError("No autenticado", 401);
  const wallet = await db.wallet.findUnique({
    where: { userId: ctx.user.id },
    include: { txs: { orderBy: { createdAt: "desc" }, take: 20 } },
  });
  return NextResponse.json({ wallet });
}

export async function POST() {
  return GET();
}
