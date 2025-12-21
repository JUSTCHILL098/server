import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import cors from "cors";

const app = express();

app.use(
  cors({
    origin: "https://weeb-delta.vercel.app",
    credentials: true,
  })
);

app.get("/", (_, res) => res.send("Server alive 🚀"));

const httpServer = createServer(app);

const io = new Server(httpServer, {
  cors: {
    origin: "https://weeb-delta.vercel.app",
    credentials: true,
  },
  transports: ["websocket"],
});

/* -------------------- DATA STORES -------------------- */
const rooms = new Map();          // roomCode -> room
const socketToRoom = new Map();   // socket.id -> roomCode
const socketToUser = new Map();   // socket.id -> { nickname, isHost }

/* -------------------- HELPERS -------------------- */
const generateRoomCode = () =>
  Math.random().toString(36).substring(2, 8).toUpperCase();

/* -------------------- SOCKET -------------------- */
io.on("connection", (socket) => {
  console.log("🔌 Connected:", socket.id);

  /* ---------- CREATE ROOM ---------- */
  socket.on("createRoom", ({ nickname }) => {
    const roomCode = generateRoomCode();

    const user = {
      id: socket.id,
      nickname: nickname?.trim() || "User",
      isHost: true,
    };

    const room = {
      roomCode,
      hostId: socket.id,
      members: [user],
      state: {
        episodeId: null,
        currentTime: 0,
        isPlaying: false,
      },
    };

    rooms.set(roomCode, room);
    socketToRoom.set(socket.id, roomCode);
    socketToUser.set(socket.id, user);

    socket.join(roomCode);

    socket.emit("roomCreated", {
      roomCode,
      members: room.members,
    });

    console.log("✅ Room created:", roomCode);
  });

  /* ---------- JOIN ROOM ---------- */
  socket.on("joinRoom", ({ roomCode, nickname }) => {
    const room = rooms.get(roomCode);
    if (!room) {
      socket.emit("roomError", "Room not found");
      return;
    }

    const user = {
      id: socket.id,
      nickname: nickname?.trim() || "User",
      isHost: false,
    };

    room.members.push(user);
    socketToRoom.set(socket.id, roomCode);
    socketToUser.set(socket.id, user);

    socket.join(roomCode);

    socket.emit("roomJoined", {
      roomCode,
      members: room.members,
    });

    io.to(roomCode).emit("userJoined", {
      members: room.members,
    });

    // 🔥 SEND FULL STATE TO NEW USER
    socket.emit("roomState", room.state);

    console.log(`👤 ${user.nickname} joined ${roomCode}`);
  });

  /* ---------- VIDEO SYNC ---------- */
  socket.on("videoAction", ({ action, time }) => {
    const roomCode = socketToRoom.get(socket.id);
    const room = rooms.get(roomCode);
    if (!room || socket.id !== room.hostId) return;

    room.state.currentTime = time;
    room.state.isPlaying = action === "play";

    socket.to(roomCode).emit("videoAction", { action, time });
  });

  /* ---------- EPISODE SYNC ---------- */
  socket.on("episodeChange", ({ episodeId }) => {
    const roomCode = socketToRoom.get(socket.id);
    const room = rooms.get(roomCode);
    if (!room || socket.id !== room.hostId) return;

    room.state.episodeId = episodeId;
    room.state.currentTime = 0;

    socket.to(roomCode).emit("episodeChange", { episodeId });
  });

  /* ---------- CHAT (FIXED) ---------- */
  socket.on("chatMessage", ({ message }) => {
    const roomCode = socketToRoom.get(socket.id);
    const user = socketToUser.get(socket.id);
    if (!roomCode || !user || !message?.trim()) return;

    io.to(roomCode).emit("chatMessage", {
      id: Date.now(),
      nickname: user.nickname,
      message,
      isHost: user.isHost,
      isSystem: false,
    });
  });

  /* ---------- DISCONNECT ---------- */
  socket.on("disconnect", () => {
    const roomCode = socketToRoom.get(socket.id);
    const room = rooms.get(roomCode);
    if (!room) return;

    room.members = room.members.filter((m) => m.id !== socket.id);
    socketToRoom.delete(socket.id);
    socketToUser.delete(socket.id);

    // Host left → promote next
    if (room.hostId === socket.id && room.members.length > 0) {
      room.hostId = room.members[0].id;
      room.members[0].isHost = true;
    }

    if (room.members.length === 0) {
      rooms.delete(roomCode);
      console.log("🧹 Room deleted:", roomCode);
    } else {
      io.to(roomCode).emit("userJoined", {
        members: room.members,
      });
    }

    console.log("❌ Disconnected:", socket.id);
  });
});

/* -------------------- START -------------------- */
const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Server running on ${PORT}`);
});
