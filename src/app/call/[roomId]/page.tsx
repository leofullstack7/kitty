import { db } from "@/lib/db";
import { getSession } from "@/lib/session-token";
import { redirect } from "next/navigation";
import { VideoRoom } from "@/components/video-room";

export const dynamic = "force-dynamic";

export default async function CallPage({ params }: { params: Promise<{ roomId: string }> }) {
  const { roomId } = await params;
  const session = await getSession();
  if (!session) redirect("/login");
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

  return (
    <VideoRoom
      roomId={roomId}
      hostName={call.kitty.user.displayName}
      guestName={call.guestKitty?.user.displayName ?? null}
      userName={call.user.displayName}
      hostUserId={call.kitty.userId}
      guestUserId={call.guestKitty?.userId ?? null}
      callerUserId={call.userId}
      mySeat={mySeat}
    />
  );
}
