import { db } from "@/lib/db";
import { getSession } from "@/lib/session-token";
import { redirect } from "next/navigation";
import { VideoRoom } from "@/components/video-room";
import { guestLiveNow, reconcileCallByRoom, sweepStaleOccupancy } from "@/lib/occupancy";

export const dynamic = "force-dynamic";

export default async function CallPage({ params }: { params: Promise<{ roomId: string }> }) {
  const { roomId } = await params;
  const session = await getSession();
  if (!session) redirect("/login");
  await sweepStaleOccupancy();
  await reconcileCallByRoom(roomId, { abandon: false });
  const call = await db.callSession.findUnique({
    where: { roomId },
    include: {
      user: true,
      kitty: { include: { user: true } },
      guestKitty: { include: { user: true } },
    },
  });
  if (!call) redirect("/inbox");
  const allowed =
    session.sub === call.userId ||
    session.sub === call.kitty.userId ||
    session.sub === call.guestKitty?.userId ||
    session.role === "ADMIN";
  if (!allowed) redirect("/explore");

  const mySeat =
    session.sub === call.userId ? "USER" : session.sub === call.kitty.userId ? "HOST" : "GUEST";
  const guestLive = guestLiveNow(call.guestSeenAt);

  return (
    <VideoRoom
      roomId={roomId}
      hostName={call.kitty.user.displayName}
      guestName={guestLive ? call.guestKitty?.user.displayName ?? null : null}
      userName={call.user.displayName}
      hostUserId={call.kitty.userId}
      guestUserId={guestLive ? call.guestKitty?.userId ?? null : null}
      callerUserId={call.userId}
      mySeat={mySeat}
      phase={call.phase === "PREVIEW" ? "PREVIEW" : "ROOM"}
      endsAt={call.endsAt?.toISOString() ?? null}
    />
  );
}
