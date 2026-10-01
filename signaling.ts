import { createServer } from "http";
import { Server } from "socket.io";
import { jwtVerify } from "jose";

const port = Number(process.env.SIGNAL_PORT ?? 3001);
const appOrigin = process.env.APP_ORIGIN ?? "http://localhost:3000";

function originOk(incoming?: string) {
  if (!incoming) return true;
  if (incoming === appOrigin) return true;
  try {
    const host = new URL(incoming).hostname;
    if (host === "localhost" || host === "127.0.0.1") return true;
    return (
      /^192\.168\.\d+\.\d+$/.test(host) ||
      /^10\.\d+\.\d+\.\d+$/.test(host) ||
      /^172\.(1[6-9]|2\d|3[0-1])\.\d+\.\d+$/.test(host)
    );
  } catch {
    return false;
  }
}

type SocketUser = { id: string; username: string; role: string; displayName: string };

async function userFromAuth(token?: string): Promise<SocketUser | null> {
  const secret = process.env.JWT_SECRET;
  if (!token || !secret) return null;
  try {
    const { payload } = await jwtVerify(token, new TextEncoder().encode(secret));
    return {
      id: String(payload.sub),
      username: String(payload.username),
      role: String(payload.role),
      displayName: String(payload.displayName),
    };
  } catch {
    return null;
  }
}

const httpServer = createServer();
const io = new Server(httpServer, {
  path: "/socket.io",
  cors: {
    origin: (incoming, cb) => cb(null, originOk(incoming)),
    credentials: true,
  },
});

io.use(async (socket, next) => {
  const user = await userFromAuth(typeof socket.handshake.auth?.token === "string" ? socket.handshake.auth.token : undefined);
  if (!user) return next(new Error("auth"));
  socket.data.user = user;
  next();
});

io.on("connection", (socket) => {
  const user = socket.data.user as SocketUser;
  socket.join(`user:${user.id}`);

  socket.on("presence", (payload: { available?: boolean; slug?: string }) => {
    if (user.role !== "KITTY" && user.role !== "ADMIN") return;
    io.emit("presence:update", { userId: user.id, slug: payload?.slug, available: !!payload?.available });
  });

  socket.on("join-room", (roomId: unknown) => {
    if (typeof roomId !== "string" || roomId.length > 80) return;
    socket.join(`room:${roomId}`);
    const size = io.sockets.adapter.rooms.get(`room:${roomId}`)?.size ?? 1;
    socket.emit("room-state", { peers: size });
    socket.to(`room:${roomId}`).emit("peer-joined", { displayName: user.displayName, role: user.role });
  });

  socket.on("signal", (payload: { roomId: string; data: unknown }) => {
    if (!payload?.roomId) return;
    socket.to(`room:${payload.roomId}`).emit("signal", { from: user.id, data: payload.data });
  });

  socket.on("chat", (payload: { roomId: string; body: string }) => {
    const body = String(payload?.body ?? "").slice(0, 500);
    if (!payload?.roomId || !body) return;
    io.to(`room:${payload.roomId}`).emit("chat", {
      from: user.displayName,
      role: user.role,
      body,
      at: Date.now(),
    });
  });

  socket.on("orbe-burst", (payload: { roomId: string; orbes: number; activity?: string }) => {
    const orbes = Number(payload?.orbes);
    if (!payload?.roomId || ![1, 5, 10, 20, 50].includes(orbes)) return;
    io.to(`room:${payload.roomId}`).emit("orbe-burst", {
      from: user.displayName,
      orbes,
      activity: String(payload.activity ?? "impulso").slice(0, 80),
      at: Date.now(),
    });
  });

  socket.on("disconnect", () => {
    io.emit("presence:offline", { userId: user.id });
  });
});

httpServer.listen(port, "0.0.0.0", () => {
  console.log(`KITTY signaling en http://localhost:${port}`);
});
