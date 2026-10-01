import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { jsonError, requireRole } from "@/lib/auth";

export async function GET() {
  const ctx = await requireRole(["KITTY", "ADMIN"]);
  if (!ctx) return jsonError("No autorizado", 403);
  const users = await db.user.findMany({
    where: { role: "USER", isActive: true },
    select: { id: true, username: true, displayName: true },
    take: 100,
  });
  return NextResponse.json({ users });
}
