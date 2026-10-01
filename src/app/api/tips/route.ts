import { NextRequest, NextResponse } from "next/server";
import { jsonError } from "@/lib/auth";
import { listTips } from "@/lib/tips";

export async function GET(req: NextRequest) {
  const kittyId = req.nextUrl.searchParams.get("kittyId") ?? "";
  if (kittyId.length < 8) return jsonError("Kitty inválida");
  const tips = await listTips(kittyId, true);
  return NextResponse.json({
    tips: tips.map((t) => ({ id: t.id, title: t.title, orbes: t.orbes })),
  });
}
