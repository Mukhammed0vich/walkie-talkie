import express from "express";
import http from "http";
import cors from "cors";
import { Server } from "socket.io";
import fs from "fs";

const PORT = process.env.PORT || 3001;
const app = express();
app.use(cors({ origin: "*" }));
app.use(express.json());

// team roster
let team = [];
try {
  team = JSON.parse(fs.readFileSync(new URL("./team.json", import.meta.url), "utf-8"));
} catch (e) {
  console.warn("team.json o'qilmadi", e.message);
}

app.get("/", (req, res) => {
  res.json({ ok: true, service: "ratsia-server", users: team.length, online: onlineUsers.size });
});
app.get("/team", (req, res) => res.json(team));
app.get("/health", (req, res) => res.json({ ok: true, uptime: process.uptime() }));

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] },
  maxHttpBufferSize: 1e6 // 1MB per audio chunk
});

// state
const onlineUsers = new Map(); // userId -> socketId
const socketToUser = new Map(); // socketId -> userId
const busy = new Map(); // channel key -> boolean, key = sorted(userA,userB).join(':')
let talking = null; // { from, to }

function channelKey(a, b) {
  return [a, b].sort().join(":");
}

function broadcastPresence() {
  const presence = team.map((u) => ({
    ...u,
    online: onlineUsers.has(u.id),
    socketId: onlineUsers.get(u.id) || null
  }));
  io.emit("presence:update", presence);
  // also talking state
  io.emit("talking:update", talking);
}

function isChannelBusy(a, b) {
  const key = channelKey(a, b);
  return busy.get(key) === true;
}

io.on("connection", (socket) => {
  console.log(`[connect] ${socket.id}`);

  socket.on("user:join", ({ userId }) => {
    const user = team.find((u) => u.id === userId);
    if (!user) {
      socket.emit("error:msg", { message: "Foydalanuvchi topilmadi: " + userId });
      return;
    }
    // if already online with another socket, kick old
    const oldSocket = onlineUsers.get(userId);
    if (oldSocket && oldSocket !== socket.id) {
      const old = io.sockets.sockets.get(oldSocket);
      if (old) {
        old.emit("kicked", { reason: "Boshqa joydan kirildi" });
        old.disconnect(true);
      }
    }
    onlineUsers.set(userId, socket.id);
    socketToUser.set(socket.id, userId);
    socket.data.userId = userId;
    console.log(`[join] ${user.name} (${userId}) -> ${socket.id}`);
    socket.emit("user:joined", { userId, team });
    broadcastPresence();
  });

  // PTT flow: ptt:start -> ptt:audio (chunks) -> ptt:end
  socket.on("ptt:start", ({ to }) => {
    const from = socketToUser.get(socket.id);
    if (!from) return;
    if (!to || !onlineUsers.has(to)) {
      socket.emit("ptt:error", { message: "Qabul qiluvchi oflayn" });
      return;
    }
    if (from === to) {
      socket.emit("ptt:error", { message: "O'zingizga yuborib bo'lmaydi" });
      return;
    }
    const key = channelKey(from, to);
    if (busy.get(key)) {
      socket.emit("ptt:busy", { message: "Kanal band" });
      return;
    }
    busy.set(key, true);
    talking = { from, to, startedAt: Date.now() };
    console.log(`[ptt:start] ${from} -> ${to}`);
    // notify target
    const targetSocketId = onlineUsers.get(to);
    if (targetSocketId) io.to(targetSocketId).emit("ptt:incoming:start", { from, to });
    // notify sender ok
    socket.emit("ptt:started", { from, to });
    // notify all for UI
    io.emit("talking:update", talking);
    io.emit("ptt:channel:busy", { from, to, busy: true });
  });

  socket.on("ptt:audio", ({ to, chunk }) => {
    const from = socketToUser.get(socket.id);
    if (!from || !to) return;
    const targetSocketId = onlineUsers.get(to);
    if (!targetSocketId) return;
    // chunk is base64 or ArrayBuffer (socket.io handles binary)
    // forward directly
    io.to(targetSocketId).emit("ptt:audio", { from, to, chunk });
  });

  // alternative: single blob message (simpler client) — mimeType bilan birga
  socket.on("ptt:blob", ({ to, blob, mimeType }) => {
    const from = socketToUser.get(socket.id);
    if (!from || !to) return;
    const targetSocketId = onlineUsers.get(to);
    if (!targetSocketId) {
      socket.emit("ptt:error", { message: "Qabul qiluvchi oflayn" });
      return;
    }
    console.log(`[ptt:blob] ${from} -> ${to} (${blob?.length || blob?.byteLength || 0} bytes) ${mimeType||''}`);
    io.to(targetSocketId).emit("ptt:blob", { from, to, blob, mimeType });
    // also send delivered ack to sender
    socket.emit("ptt:delivered", { to });
  });

  socket.on("ptt:end", ({ to }) => {
    const from = socketToUser.get(socket.id);
    if (!from) return;
    const key = channelKey(from, to);
    busy.delete(key);
    console.log(`[ptt:end] ${from} -> ${to}`);
    const targetSocketId = onlineUsers.get(to);
    if (targetSocketId) io.to(targetSocketId).emit("ptt:incoming:end", { from, to });
    socket.emit("ptt:ended", { from, to });
    // clear talking if matches
    if (talking && talking.from === from && talking.to === to) {
      talking = null;
      io.emit("talking:update", null);
    }
    io.emit("ptt:channel:busy", { from, to, busy: false });
  });

  socket.on("ptt:cancel", ({ to }) => {
    const from = socketToUser.get(socket.id);
    if (!from) return;
    const key = channelKey(from, to);
    busy.delete(key);
    if (talking && talking.from === from) talking = null;
    io.emit("talking:update", talking);
    io.emit("ptt:channel:busy", { from, to, busy: false });
  });

  socket.on("disconnect", () => {
    const userId = socketToUser.get(socket.id);
    console.log(`[disconnect] ${socket.id} (${userId || "?"})`);
    if (userId) {
      // only delete if this socket is the current one
      if (onlineUsers.get(userId) === socket.id) {
        onlineUsers.delete(userId);
      }
      socketToUser.delete(socket.id);
      // clear busy channels involving this user
      for (const [k] of busy) {
        if (k.includes(userId)) busy.delete(k);
      }
      if (talking && (talking.from === userId || talking.to === userId)) {
        talking = null;
        io.emit("talking:update", null);
      }
      broadcastPresence();
    }
  });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`\n✓ Ratsia server ishga tushdi`);
  console.log(`  Local:  http://localhost:${PORT}`);
  console.log(`  Team:   ${team.length} kishi`);
  console.log(`  Tunnel uchun: cloudflared tunnel --url http://localhost:${PORT}`);
  console.log(`  Yoki:       npx localtunnel --port ${PORT}\n`);
});
