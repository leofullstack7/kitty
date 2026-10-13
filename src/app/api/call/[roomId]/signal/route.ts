import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { jsonError, requireSession } from "@/lib/auth";
import { originAllowed } from "@/lib/security";

async function loadCall(roomId: string) {
  return db.callSession.findUnique({
    where: { roomId },
    include: { kitty: true, guestKitty: true },
  });
}

function inCall(
  call: { userId: string; kitty: { userId: string }; guestKitty: { userId: string } | null },
  userId: string,
  role: string,
) {
  return role === "ADMIN" || userId === call.userId || userId === call.kitty.userId || userId === call.guestKitty?.userId;
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ roomId: string }> }) {
  if (!originAllowed(req)) return jsonError("Origen no permitido", 403);
  const ctx = await requireSession();
  if (!ctx) return jsonError("No autenticado", 401);
  const { roomId } = await params;
  const call = await loadCall(roomId);
  if (!call || call.status === "ENDED") return jsonError("Sala no válida", 404);
  if (!inCall(call, ctx.user.id, ctx.user.role)) return jsonError("No estás en esta noche", 403);

  const body = (await req.json().catch(() => null)) as { to?: string; data?: unknown } | null;
  if (!body?.data || typeof body.data !== "object") return jsonError("Señal inválida");

  const payload = JSON.stringify(body.data);
  if (payload.length > 12_000) return jsonError("Señal demasiado grande");

  await db.callSignal.create({
    data: {
      callId: call.id,
      fromId: ctx.user.id,
      toId: typeof body.to === "string" ? body.to : null,
      payload,
    },
  });

  await db.callSignal.deleteMany({
    where: { callId: call.id, createdAt: { lt: new Date(Date.now() - 90_000) } },
  });

  return NextResponse.json({ ok: true });
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ roomId: string }> }) {
  const ctx = await requireSession();
  if (!ctx) return jsonError("No autenticado", 401);
  const { roomId } = await params;
  const call = await loadCall(roomId);
  if (!call || call.status === "ENDED") return jsonError("Sala no válida", 404);
  if (!inCall(call, ctx.user.id, ctx.user.role)) return jsonError("No estás en esta noche", 403);

  const afterRaw = Number(req.nextUrl.searchParams.get("after") ?? 0);
  const afterAt = afterRaw > 0 ? new Date(afterRaw) : new Date(Date.now() - 20_000);
  const rows = await db.callSignal.findMany({
    where: {
      callId: call.id,
      fromId: { not: ctx.user.id },
      OR: [{ toId: null }, { toId: ctx.user.id }],
      createdAt: { gte: afterAt },
    },
    orderBy: { createdAt: "asc" },
    take: 80,
  });

  return NextResponse.json({
    signals: rows.map((row) => ({
      id: row.id,
      from: row.fromId,
      at: row.createdAt.getTime(),
      data: (() => {
        try {
          return JSON.parse(row.payload) as unknown;
        } catch {
          return {};
        }
      })(),
    })),
  });
}
