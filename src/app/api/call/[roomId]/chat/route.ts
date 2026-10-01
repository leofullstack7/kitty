import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { jsonError, requireSession } from "@/lib/auth";
import { originAllowed, sanitizeText } from "@/lib/security";
import { moderateText } from "@/lib/claude";

const schema = z.object({ body: z.string().min(1).max(500) });

async function loadCall(roomId: string) {
  return db.callSession.findUnique({
    where: { roomId },
    include: { kitty: true, guestKitty: true },
  });
}

function canSpeak(userId: string, role: string, call: NonNullable<Awaited<ReturnType<typeof loadCall>>>) {
  if (role === "ADMIN") return true;
  if (call.userId === userId) return true;
  if (call.kitty.userId === userId) return true;
  if (call.guestKitty?.userId === userId) return true;
  return false;
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ roomId: string }> }) {
  if (!originAllowed(req)) return jsonError("Origen no permitido", 403);
  const ctx = await requireSession();
  if (!ctx) return jsonError("No autenticado", 401);
  const { roomId } = await params;
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError("Mensaje vacío");
  const call = await loadCall(roomId);
  if (!call || call.status === "ENDED") return jsonError("Sala no válida", 404);
  if (!canSpeak(ctx.user.id, ctx.user.role, call)) return jsonError("No estás en esta noche", 403);

  const body = sanitizeText(parsed.data.body, 500);
  const mod = await moderateText(body, "chat");
  if (!mod.allowed) return jsonError("Ese mensaje no se puede enviar");

  const saved = await db.chatMessage.create({
    data: { callId: call.id, senderId: ctx.user.id, body: mod.rewritten },
  });

  return NextResponse.json({
    ok: true,
    line: {
      id: saved.id,
      from: ctx.user.displayName,
      role: ctx.user.role,
      body: mod.rewritten,
      at: saved.createdAt.getTime(),
      kind: "chat",
    },
  });
}
