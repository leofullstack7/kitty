import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";

export async function GET() {
  const ctx = await requireSession();
  if (!ctx) return NextResponse.json({ me: null }, { status: 401 });
  return NextResponse.json({
    me: {
      id: ctx.user.id,
      username: ctx.user.username,
      role: ctx.user.role,
      displayName: ctx.user.displayName,
      balance: ctx.user.wallet?.balance ?? 0,
      kittySlug: ctx.user.kittyProfile?.slug ?? null,
      available: ctx.user.kittyProfile?.isAvailable ?? false,
    },
  });
}
