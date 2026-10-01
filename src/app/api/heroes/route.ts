import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET() {
  const heroes = await db.heroBanner.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" } });
  return NextResponse.json({ heroes });
}
