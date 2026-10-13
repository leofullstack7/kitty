import { db } from "../src/lib/db";
import { sweepStaleOccupancy } from "../src/lib/occupancy";

async function main() {
  const live = await db.callSession.findMany({
    where: { status: { in: ["WAITING", "LIVE"] } },
    include: {
      guestKitty: { include: { user: true } },
      kitty: { include: { user: true } },
    },
  });
  console.log(
    "live before",
    live.map((c) => ({
      room: c.roomId,
      status: c.status,
      host: c.kitty.user.displayName,
      guest: c.guestKitty?.user.displayName ?? null,
      guestSeen: c.guestSeenAt,
      hostSeen: c.hostSeenAt,
    })),
  );
  await sweepStaleOccupancy();
  const after = await db.callSession.findMany({
    where: { status: { in: ["WAITING", "LIVE"] } },
    include: { guestKitty: { include: { user: true } } },
  });
  console.log(
    "live after",
    after.map((c) => ({ room: c.roomId, guest: c.guestKitty?.user.displayName ?? null, guestId: c.guestKittyId })),
  );
  const staleWaiting = await db.callSession.findMany({
    where: { status: "WAITING", hostSeenAt: null, userSeenAt: null },
    include: { proposal: true },
  });
  for (const call of staleWaiting) {
    const started = call.proposal?.createdAt ?? call.createdAt;
    if (Date.now() - started.getTime() < 30 * 60_000) continue;
    await db.callSession.update({
      where: { id: call.id },
      data: { status: "ENDED", endedAt: new Date() },
    });
    await db.callInvite.updateMany({
      where: { callId: call.id, status: "PENDING" },
      data: { status: "DECLINED", resolvedAt: new Date() },
    });
    const stillLive = await db.callSession.findFirst({
      where: { status: { in: ["WAITING", "LIVE"] }, OR: [{ kittyId: call.kittyId }, { guestKittyId: call.kittyId }] },
    });
    if (!stillLive) {
      await db.kittyProfile.update({
        where: { id: call.kittyId },
        data: { busyRoomId: null, isAvailable: true },
      });
    }
    console.log("ended waiting", call.roomId);
  }

  const busy = await db.kittyProfile.findMany({
    where: { busyRoomId: { not: null } },
    select: { slug: true, busyRoomId: true },
  });
  console.log("busy", busy);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
