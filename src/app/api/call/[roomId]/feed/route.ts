import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { jsonError, requireSession } from "@/lib/auth";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ roomId: string }> }) {
  const ctx = await requireSession();
  if (!ctx) return jsonError("No autenticado", 401);
  const { roomId } = await params;
  const call = await db.callSession.findUnique({
    where: { roomId },
    include: {
      user: true,
      kitty: { include: { user: true } },
      guestKitty: { include: { user: true } },
      messages: { include: { sender: true }, orderBy: { createdAt: "asc" }, take: 80 },
      orbeBursts: { orderBy: { createdAt: "asc" }, take: 40 },
      activities: { orderBy: { createdAt: "asc" }, take: 40 },
    },
  });
  if (!call) return jsonError("Sala no válida", 404);
  const allowed =
    ctx.user.role === "ADMIN" ||
    ctx.user.id === call.userId ||
    ctx.user.id === call.kitty.userId ||
    ctx.user.id === call.guestKitty?.userId;
  if (!allowed) return jsonError("No estás en esta noche", 403);

  type Event = {
    id: string;
    kind: "chat" | "orbe" | "activity" | "system";
    from: string;
    role: string;
    body: string;
    orbes?: number;
    activity?: string;
    status?: string;
    at: number;
  };

  const events: Event[] = [];
  for (const m of call.messages) {
    events.push({
      id: m.id,
      kind: "chat",
      from: m.sender.displayName,
      role: m.sender.role,
      body: m.body,
      at: m.createdAt.getTime(),
    });
  }
  for (const b of call.orbeBursts) {
    events.push({
      id: b.id,
      kind: "orbe",
      from: call.user.displayName,
      role: "USER",
      body: `le ofreció ${b.orbes} orbes a ${call.kitty.user.displayName} · ${b.activity}`,
      orbes: b.orbes,
      activity: b.activity,
      at: b.createdAt.getTime(),
    });
  }
  for (const a of call.activities) {
    const label =
      a.status === "ACCEPTED"
        ? `${call.user.displayName} propuso “${a.activity}” por ${a.orbes} orbes · ella aceptó`
        : a.status === "REJECTED"
          ? `${call.user.displayName} propuso “${a.activity}” por ${a.orbes} orbes · ella declinó`
          : `${call.user.displayName} propone “${a.activity}” por ${a.orbes} orbes · esperando a ella`;
    events.push({
      id: a.id,
      kind: "activity",
      from: call.user.displayName,
      role: "USER",
      body: label,
      orbes: a.orbes,
      activity: a.activity,
      status: a.status,
      at: a.createdAt.getTime(),
    });
  }
  events.sort((a, b) => a.at - b.at);

  const pending = call.activities.find((a) => a.status === "PENDING") ?? null;

  return NextResponse.json({
    events: events.slice(-80),
    pendingActivity: pending
      ? { id: pending.id, activity: pending.activity, orbes: pending.orbes, from: call.user.displayName }
      : null,
    guest: call.guestKitty
      ? { id: call.guestKitty.id, userId: call.guestKitty.userId, displayName: call.guestKitty.user.displayName, slug: call.guestKitty.slug }
      : null,
    host: { id: call.kitty.id, userId: call.kitty.userId, displayName: call.kitty.user.displayName, slug: call.kitty.slug },
    user: { id: call.user.id, displayName: call.user.displayName },
    status: call.status,
  });
}
