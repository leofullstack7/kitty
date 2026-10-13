import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { jsonError, requireRole } from "@/lib/auth";
import { originAllowed } from "@/lib/security";
import { BEATS } from "@/lib/call-economy";
import { EXTEND_MINUTES, TIME_EXTEND_MARK } from "@/lib/constants";

export async function POST(req: NextRequest, { params }: { params: Promise<{ roomId: string }> }) {
  if (!originAllowed(req)) return jsonError("Origen no permitido", 403);
  const ctx = await requireRole(["USER"]);
  if (!ctx) return jsonError("No autorizado", 403);
  const { roomId } = await params;

  const call = await db.callSession.findUnique({
    where: { roomId },
    include: { user: { include: { wallet: true } }, activities: { where: { status: "PENDING" } } },
  });
  if (!call || call.userId !== ctx.user.id || call.status === "ENDED") return jsonError("Sala no válida", 404);
  if (call.phase !== "ROOM") return jsonError("Primero crea la sala");
  if (call.activities.length > 0) return jsonError("Ya hay un pedido de tiempo extra en el aire");

  const split = BEATS.extend();
  const wallet = call.user.wallet;
  if (!wallet || wallet.balance < split.userPays) return jsonError("Necesitas 2 orbes para pedir 5 minutos más");

  const created = await db.callActivity.create({
    data: {
      callId: call.id,
      activity: TIME_EXTEND_MARK,
      orbes: split.original,
      userPays: split.userPays,
      platformFee: split.platformFee,
      kittyNet: split.kittyNet,
    },
  });

  return NextResponse.json({
    ok: true,
    activity: {
      id: created.id,
      activity: `+${EXTEND_MINUTES} minutos`,
      orbes: created.orbes,
      from: ctx.user.displayName,
      kind: "time",
    },
  });
}
