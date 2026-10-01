import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { jsonError, requireRole } from "@/lib/auth";
import { originAllowed } from "@/lib/security";
import { bustCatalog } from "@/lib/catalog";
import { clearKittyBusy, kittyIsBusy, markKittyBusy } from "@/lib/occupancy";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!originAllowed(req)) return jsonError("Origen no permitido", 403);
  const ctx = await requireRole(["KITTY"]);
  if (!ctx?.user.kittyProfile) return jsonError("No autorizado", 403);
  const { id } = await params;
  const { status } = (await req.json().catch(() => ({}))) as { status?: string };
  if (status !== "ACCEPTED" && status !== "DECLINED") return jsonError("Estado inválido");

  const invite = await db.callInvite.findUnique({
    where: { id },
    include: { call: true },
  });
  if (!invite || invite.toKittyId !== ctx.user.kittyProfile.id || invite.status !== "PENDING") {
    return jsonError("Invitación no disponible");
  }
  if (invite.call.status === "ENDED") {
    await db.callInvite.update({ where: { id }, data: { status: "DECLINED", resolvedAt: new Date() } });
    return jsonError("Esa noche ya terminó");
  }

  if (status === "DECLINED") {
    await db.callInvite.update({ where: { id }, data: { status: "DECLINED", resolvedAt: new Date() } });
    return NextResponse.json({ ok: true });
  }

  if (invite.call.guestKittyId) return jsonError("Ya entró otra Kitty");
  if (await kittyIsBusy(ctx.user.kittyProfile.id, invite.call.roomId)) {
    return jsonError("Estás en otra noche. Termínala antes de entrar a esta.");
  }

  try {
    await db.$transaction(async (tx) => {
      await markKittyBusy(tx, ctx.user.kittyProfile!.id, invite.call.roomId);
      await tx.callSession.update({
        where: { id: invite.callId },
        data: { guestKittyId: ctx.user.kittyProfile!.id, status: "LIVE" },
      });
      await tx.callInvite.update({ where: { id }, data: { status: "ACCEPTED", resolvedAt: new Date() } });
      await tx.callInvite.updateMany({
        where: { callId: invite.callId, status: "PENDING", id: { not: id } },
        data: { status: "DECLINED", resolvedAt: new Date() },
      });
    });
  } catch {
    await clearKittyBusy(db, ctx.user.kittyProfile.id, invite.call.roomId).catch(() => undefined);
    return jsonError("No se pudo entrar. Intenta de nuevo.");
  }

  bustCatalog();
  return NextResponse.json({ ok: true, roomId: invite.call.roomId });
}
