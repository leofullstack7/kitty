import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { jsonError, requireRole } from "@/lib/auth";
import { originAllowed } from "@/lib/security";
import { kittyIsBusy } from "@/lib/occupancy";

const schema = z.object({ toKittyId: z.string().min(8) });

export async function GET(_req: NextRequest, { params }: { params: Promise<{ roomId: string }> }) {
  const ctx = await requireRole(["KITTY", "ADMIN"]);
  if (!ctx) return jsonError("No autorizado", 403);
  const { roomId } = await params;
  const call = await db.callSession.findUnique({ where: { roomId }, include: { kitty: true } });
  if (!call) return jsonError("Sala no válida", 404);
  if (ctx.user.role === "KITTY" && call.kittyId !== ctx.user.kittyProfile?.id) return jsonError("Solo la anfitriona invita", 403);

  const kittys = await db.kittyProfile.findMany({
    where: {
      id: { not: call.kittyId },
      isAvailable: true,
      busyRoomId: null,
    },
    include: { user: { select: { displayName: true } } },
    orderBy: { slug: "asc" },
  });

  return NextResponse.json({
    kittys: kittys.map((k) => ({ id: k.id, slug: k.slug, displayName: k.user.displayName, avatarPath: k.avatarPath })),
  });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ roomId: string }> }) {
  if (!originAllowed(req)) return jsonError("Origen no permitido", 403);
  const ctx = await requireRole(["KITTY", "ADMIN"]);
  if (!ctx?.user.kittyProfile) return jsonError("No autorizado", 403);
  const { roomId } = await params;
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError("Kitty inválida");

  const call = await db.callSession.findUnique({ where: { roomId }, include: { kitty: true, guestKitty: true } });
  if (!call || call.status === "ENDED") return jsonError("Sala no válida", 404);
  if (ctx.user.role === "KITTY" && call.kittyId !== ctx.user.kittyProfile.id) return jsonError("Solo la anfitriona invita", 403);
  if (call.guestKittyId) return jsonError("Ya hay otra Kitty en esta noche");
  if (parsed.data.toKittyId === call.kittyId) return jsonError("No puedes invitarte a ti misma");

  const target = await db.kittyProfile.findUnique({
    where: { id: parsed.data.toKittyId },
    include: { user: true },
  });
  if (!target) return jsonError("Kitty no existe", 404);
  if (await kittyIsBusy(target.id)) return jsonError("Ella ya está en otra noche");

  const existing = await db.callInvite.findFirst({
    where: { callId: call.id, toKittyId: target.id, status: "PENDING" },
  });
  if (existing) return jsonError("Esa invitación ya está en el aire");

  const invite = await db.callInvite.create({
    data: {
      callId: call.id,
      fromKittyId: call.kittyId,
      toKittyId: target.id,
    },
  });

  await db.notification.create({
    data: {
      userId: target.userId,
      title: `${ctx.user.displayName} te invita a una noche`,
      body: "Entra ahora. Ella y un user te están esperando.",
      href: `/call/${roomId}`,
    },
  });

  return NextResponse.json({ ok: true, inviteId: invite.id, to: target.user.displayName });
}
