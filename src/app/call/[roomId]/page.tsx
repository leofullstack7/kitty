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
    include: { user: true, kitty: { include: { user: true } } },
  });
  if (!call) redirect("/inbox");
  const allowed = session.sub === call.userId || session.sub === call.kitty.userId || session.role === "ADMIN";
  if (!allowed) redirect("/explore");
  const peerName = session.sub === call.userId ? call.kitty.user.displayName : call.user.displayName;
  return <VideoRoom roomId={roomId} peerName={peerName} />;
}
