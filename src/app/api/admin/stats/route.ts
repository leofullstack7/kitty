import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { jsonError, requireRole } from "@/lib/auth";

export async function GET() {
  const ctx = await requireRole(["ADMIN"]);
  if (!ctx) return jsonError("No autorizado", 403);
  const [users, kittys, wallets, pendingBonuses] = await Promise.all([
    db.user.count({ where: { role: "USER" } }),
    db.kittyProfile.count(),
    db.wallet.aggregate({ _sum: { balance: true } }),
    db.bonus.count({ where: { status: "PENDING_APPROVAL" } }),
  ]);
  return NextResponse.json({
    users,
    kittys,
    orbes: wallets._sum.balance ?? 0,
    pendingBonuses,
  });
}
