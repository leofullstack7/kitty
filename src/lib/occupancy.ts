import { db } from "./db";
import { bustCatalog } from "./catalog";
import { PREVIEW_SECONDS } from "./constants";

type Tx = {
  kittyProfile: typeof db.kittyProfile;
  callSession: typeof db.callSession;
  callInvite: typeof db.callInvite;
  callActivity: typeof db.callActivity;
};

const PRESENCE_TTL_MS = 40_000;
const ABANDON_MS = 6 * 60 * 60_000;
let lastSweepAt = 0;

function isFresh(at: Date | null | undefined, ttl = PRESENCE_TTL_MS) {
  return !!at && Date.now() - at.getTime() < ttl;
}

type CallOccupancy = {
  id: string;
  roomId: string;
  status: string;
  phase: string;
  endsAt: Date | null;
  kittyId: string;
  userId: string;
  guestKittyId: string | null;
  hostSeenAt: Date | null;
  userSeenAt: Date | null;
  guestSeenAt: Date | null;
  createdAt: Date;
  startedAt: Date | null;
  proposal: { createdAt: Date } | null;
  invites: { toKittyId: string; status: string; resolvedAt: Date | null; createdAt: Date }[];
  messages: { createdAt: Date }[];
  activities: { status: string; activity: string }[];
};

function lastActivityAt(call: CallOccupancy) {
  const times = [
    call.hostSeenAt,
    call.userSeenAt,
    call.guestSeenAt,
    call.createdAt,
    call.proposal?.createdAt,
    ...call.invites.map((i) => i.createdAt),
    ...call.invites.map((i) => i.resolvedAt),
    ...call.messages.map((m) => m.createdAt),
  ].filter((d): d is Date => !!d);
  return times.reduce((max, d) => (d > max ? d : max), new Date(0));
}

async function loadOccupancy(roomId: string): Promise<CallOccupancy | null> {
  return db.callSession.findUnique({
    where: { roomId },
    select: {
      id: true,
      roomId: true,
      status: true,
      phase: true,
      endsAt: true,
      kittyId: true,
      userId: true,
      guestKittyId: true,
      hostSeenAt: true,
      userSeenAt: true,
      guestSeenAt: true,
      createdAt: true,
      startedAt: true,
      proposal: { select: { createdAt: true } },
      invites: { select: { toKittyId: true, status: true, resolvedAt: true, createdAt: true }, take: 30, orderBy: { createdAt: "desc" } },
      messages: { select: { createdAt: true }, take: 1, orderBy: { createdAt: "desc" } },
      activities: { select: { status: true, activity: true }, where: { status: "PENDING" }, take: 5 },
    },
  });
}

export async function dropGuestFromCall(tx: Tx, call: { id: string; roomId: string; guestKittyId: string | null }) {
  if (!call.guestKittyId) return;
  await tx.callSession.update({
    where: { id: call.id },
    data: { guestKittyId: null, guestSeenAt: null },
  });
  await clearKittyBusy(tx, call.guestKittyId, call.roomId);
}

async function endAbandonedCall(call: CallOccupancy) {
  await db.$transaction(async (tx) => {
    await tx.callSession.update({
      where: { id: call.id },
      data: { status: "ENDED", endedAt: new Date() },
    });
    await tx.callInvite.updateMany({
      where: { callId: call.id, status: "PENDING" },
      data: { status: "DECLINED", resolvedAt: new Date() },
    });
    await tx.callActivity.updateMany({
      where: { callId: call.id, status: "PENDING" },
      data: { status: "REJECTED", resolvedAt: new Date() },
    });
    await clearKittyBusy(tx, call.kittyId, call.roomId);
    if (call.guestKittyId) await clearKittyBusy(tx, call.guestKittyId, call.roomId);
  });
  bustCatalog();
}

export async function reconcileCallByRoom(roomId: string, opts?: { abandon?: boolean }) {
  const call = await loadOccupancy(roomId);
  if (!call || call.status === "ENDED") return call;
  if (opts?.abandon === false) return call;

  const quiet =
    !isFresh(call.hostSeenAt, ABANDON_MS) &&
    !isFresh(call.userSeenAt, ABANDON_MS) &&
    Date.now() - lastActivityAt(call).getTime() > ABANDON_MS;
  if (!quiet) return call;

  await endAbandonedCall(call);
  return { ...call, status: "ENDED", guestKittyId: null as string | null };
}

export async function sweepStaleOccupancy() {
  if (Date.now() - lastSweepAt < 12_000) return;
  lastSweepAt = Date.now();
  const live = await db.callSession.findMany({
    where: { status: { in: ["WAITING", "LIVE"] } },
    select: { roomId: true },
    take: 80,
  });
  for (const row of live) {
    await reconcileCallByRoom(row.roomId);
  }

  const busy = await db.kittyProfile.findMany({
    where: { busyRoomId: { not: null } },
    select: { id: true, busyRoomId: true },
    take: 80,
  });
  for (const kitty of busy) {
    if (!kitty.busyRoomId) continue;
    const call = await db.callSession.findUnique({
      where: { roomId: kitty.busyRoomId },
      select: { status: true, kittyId: true, guestKittyId: true },
    });
    if (!call || call.status === "ENDED" || (call.kittyId !== kitty.id && call.guestKittyId !== kitty.id)) {
      await clearKittyBusy(db, kitty.id);
    }
  }
}

export async function touchCallPresence(roomId: string, userId: string) {
  await sweepStaleOccupancy();
  const call = await db.callSession.findUnique({
    where: { roomId },
    include: { kitty: true, guestKitty: true },
  });
  if (!call || call.status === "ENDED") return { call: null, kicked: false as const, guestLive: false };

  const now = new Date();
  const data =
    userId === call.userId
      ? { userSeenAt: now }
      : userId === call.kitty.userId
        ? { hostSeenAt: now }
        : userId === call.guestKitty?.userId
          ? { guestSeenAt: now }
          : null;

  if (data) {
    const nextHost = userId === call.kitty.userId ? now : call.hostSeenAt;
    const nextUser = userId === call.userId ? now : call.userSeenAt;
    const bothHere = !!(nextHost && nextUser);
    const startPreview = call.phase === "PREVIEW" && !call.endsAt && bothHere;
    await db.callSession.update({
      where: { id: call.id },
      data: startPreview
        ? {
            ...data,
            startedAt: call.startedAt ?? now,
            endsAt: new Date(now.getTime() + PREVIEW_SECONDS * 1000),
            status: "LIVE",
          }
        : data,
    });
  }

  const live = await reconcileCallByRoom(roomId, { abandon: false });
  const kicked = userId === call.guestKitty?.userId && !live?.guestKittyId;
  return {
    call: live,
    kicked,
    guestLive: !!(live && isFresh(live.guestSeenAt)),
  };
}

export async function kickGuestFromRoom(roomId: string, hostUserId: string) {
  await sweepStaleOccupancy();
  const call = await db.callSession.findUnique({
    where: { roomId },
    include: { kitty: true, guestKitty: { include: { user: true } } },
  });
  if (!call || call.status === "ENDED") return { error: "Sala no válida", status: 404 as const };
  if (call.kitty.userId !== hostUserId) return { error: "Solo la anfitriona puede expulsar", status: 403 as const };
  if (!call.guestKitty) return { error: "No hay otra Kitty en esta noche", status: 400 as const };

  const guest = {
    id: call.guestKitty.id,
    userId: call.guestKitty.userId,
    displayName: call.guestKitty.user.displayName,
  };

  await db.$transaction(async (tx) => {
    await dropGuestFromCall(tx, call);
  });
  bustCatalog();
  return { ok: true as const, guest };
}

export async function kittyIsBusy(kittyId: string, exceptRoomId?: string) {
  await sweepStaleOccupancy();
  const kitty = await db.kittyProfile.findUnique({
    where: { id: kittyId },
    select: { busyRoomId: true },
  });
  if (kitty?.busyRoomId && kitty.busyRoomId !== exceptRoomId) return true;
  const live = await db.callSession.findFirst({
    where: {
      status: { in: ["WAITING", "LIVE"] },
      OR: [{ kittyId }, { guestKittyId: kittyId }],
      ...(exceptRoomId ? { roomId: { not: exceptRoomId } } : {}),
    },
    select: { id: true },
  });
  return !!live;
}

export async function markKittyBusy(tx: Tx, kittyId: string, roomId: string) {
  const kitty = await tx.kittyProfile.findUnique({ where: { id: kittyId }, select: { busyRoomId: true } });
  if (kitty?.busyRoomId && kitty.busyRoomId !== roomId) {
    throw new Error("ocupada");
  }
  await tx.kittyProfile.update({
    where: { id: kittyId },
    data: { isAvailable: false, busyRoomId: roomId },
  });
}

export async function clearKittyBusy(tx: Tx, kittyId: string, roomId?: string) {
  const kitty = await tx.kittyProfile.findUnique({ where: { id: kittyId }, select: { busyRoomId: true } });
  if (!kitty) return;
  if (roomId && kitty.busyRoomId && kitty.busyRoomId !== roomId) return;
  await tx.kittyProfile.update({
    where: { id: kittyId },
    data: { busyRoomId: null, isAvailable: true },
  });
}

export function guestLiveNow(guestSeenAt: Date | null | undefined) {
  return isFresh(guestSeenAt);
}
