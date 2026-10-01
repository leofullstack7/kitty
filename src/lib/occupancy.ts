import { db } from "./db";

type Tx = {
  kittyProfile: typeof db.kittyProfile;
};

export async function kittyIsBusy(kittyId: string, exceptRoomId?: string) {
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
