import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { jsonError, requireRole } from "@/lib/auth";

export async function GET() {
  const ctx = await requireRole(["ADMIN"]);
  if (!ctx) return jsonError("No autorizado", 403);

  const [kittys, heroes, bonuses, users, kittyCount, wallets, pendingBonuses] = await Promise.all([
    db.kittyProfile.findMany({
      include: { user: { select: { username: true, displayName: true } } },
      orderBy: { createdAt: "desc" },
    }),
    db.heroBanner.findMany({ orderBy: { sortOrder: "asc" } }),
    db.bonus.findMany({
      include: { kitty: { include: { user: { select: { displayName: true } } } }, user: { select: { displayName: true } } },
      orderBy: { createdAt: "desc" },
      take: 80,
    }),
    db.user.count({ where: { role: "USER" } }),
    db.kittyProfile.count(),
    db.wallet.aggregate({ _sum: { balance: true } }),
    db.bonus.count({ where: { status: "PENDING_APPROVAL" } }),
  ]);

  return NextResponse.json({
    kittys: kittys.map((k) => ({
      id: k.id,
      slug: k.slug,
      displayName: k.user.displayName,
      username: k.user.username,
      isAvailable: k.isAvailable,
      featured: k.featured,
      city: k.city,
    })),
    heroes,
    bonuses: bonuses.map((b) => ({
      id: b.id,
      percent: b.percent,
      code: b.code,
      status: b.status,
      kittyName: b.kitty.user.displayName,
      userName: b.user.displayName,
    })),
    stats: {
      users,
      kittys: kittyCount,
      orbes: wallets._sum.balance ?? 0,
      pendingBonuses,
    },
  });
}
