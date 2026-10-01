import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { jsonError, requireRole } from "@/lib/auth";

export async function GET() {
  const ctx = await requireRole(["KITTY", "ADMIN"]);
  if (!ctx?.user.kittyProfile) return jsonError("No autorizado", 403);

  const invites = await db.callInvite.findMany({
    where: { toKittyId: ctx.user.kittyProfile.id, status: "PENDING" },
    include: {
      fromKitty: { include: { user: true } },
      call: { include: { user: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 12,
  });

  return NextResponse.json({
    invites: invites
      .filter((i) => i.call.status !== "ENDED")
      .map((i) => ({
        id: i.id,
        roomId: i.call.roomId,
        fromName: i.fromKitty.user.displayName,
        fromSlug: i.fromKitty.slug,
        userName: i.call.user.displayName,
        createdAt: i.createdAt,
      })),
  });
}
