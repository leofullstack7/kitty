import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { jsonError, requireRole } from "@/lib/auth";

export async function GET() {
  const ctx = await requireRole(["ADMIN"]);
  if (!ctx) return jsonError("No autorizado", 403);
  const heroes = await db.heroBanner.findMany({ orderBy: { sortOrder: "asc" } });
  return NextResponse.json({ heroes });
}
