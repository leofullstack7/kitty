import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { jsonError, requireRole } from "@/lib/auth";

export async function GET() {
  const ctx = await requireRole(["ADMIN"]);
  if (!ctx) return jsonError("No autorizado", 403);
  const rows = await db.bonus.findMany({
    include: { kitty: { include: { user: true } }, user: true },
    orderBy: { createdAt: "desc" },
    take: 80,
  });
  return NextResponse.json({
    bonuses: rows.map((b) => ({
      id: b.id,
      percent: b.percent,
      code: b.code,
      status: b.status,
      kittyName: b.kitty.user.displayName,
      userName: b.user.displayName,
    })),
  });
}
