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

app.get("/", (_, res) => {
  res.send("Server is alive 🚀");
});

const httpServer = createServer(app);

const io = new Server(httpServer, {
  cors: {
    origin: "https://weeb-delta.vercel.app",
    credentials: true,
  },
  transports: ["websocket"],
});

const rooms = new Map();

/* ---------------------------- HELPERS ---------------------------- */
const generateRoomCode = () =>
  Math.random().toString(36).substring(2, 8).toUpperCase();

const createRoomState = () => ({
  episodeId: null,
  currentTime: 0,
  isPlaying: false,
});

/* ---------------------------- SOCKET LOGIC ---------------------------- */
io.on("connection", (socket) => {
  console.log("🔌 Connected:", socket.id);

  /* ---------------- CREATE ROOM ---------------- */
  socket.on("createRoom", ({ nickname }) => {
    const roomCode = generateRoomCode();

    const room = {
      roomCode,
      hostId: socket.id,
      members: [
        {
          id: socket.id,
          nickname: nickname || "User",
          isHost: true,
        },
      ],
      state: createRoomState(),
    };

    rooms.set(roomCode, room);
    socket.join(roomCode);

    socket.emit("roomCreated", {
      roomCode,
      members: room.members,
    });

    console.log("✅ Room created:", roomCode);
  });

  /* ---------------- JOIN ROOM ---------------- */
  socket.on("joinRoom", ({ roomCode, nickname }) => {
    const room = rooms.get(roomCode);
    if (!room) {
      socket.emit("roomError", "Room not found");
      return;
    }

    socket.join(roomCode);

    const member = {
      id: socket.id,
      nickname: nickname || "User",
      isHost: false,
    };

    room.members.push(member);

    socket.emit("roomJoined", {
      roomCode,
      members: room.members,
    });

    io.to(roomCode).emit("userJoined", {
      members: room.members,
    });

    // 🔥 SEND AUTHORITATIVE STATE
    socket.emit("roomState", room.state);

    console.log(`👤 ${member.nickname} joined ${roomCode}`);
  });

  /* ---------------- VIDEO SYNC ---------------- */
  socket.on("videoAction", ({ roomCode, action, time }) => {
    const room = rooms.get(roomCode);
    if (!room || socket.id !== room.hostId) return;

    room.state.currentTime = time;
    room.state.isPlaying = action === "play";

    socket.to(roomCode).emit("videoAction", { action, time });
  });

  /* ---------------- EPISODE SYNC ---------------- */
  socket.on("episodeChange", ({ roomCode, episodeId }) => {
    const room = rooms.get(roomCode);
    if (!room || socket.id !== room.hostId) return;

    room.state.episodeId = episodeId;
    room.state.currentTime = 0;

    socket.to(roomCode).emit("episodeChange", { episodeId });
  });

  /* ---------------- CHAT ---------------- */
  socket.on("chatMessage", ({ roomCode, message, nickname, isHost }) => {
    if (!rooms.has(roomCode)) return;

    io.to(roomCode).emit("chatMessage", {
      id: Date.now(),
      nickname,
      message,
      isHost,
      isSystem: false,
    });
  });

  /* ---------------- DISCONNECT ---------------- */
  socket.on("disconnect", () => {
    for (const [roomCode, room] of rooms) {
      const index = room.members.findIndex((m) => m.id === socket.id);
      if (index === -1) continue;

      room.members.splice(index, 1);

      // Host left → promote next user
      if (room.hostId === socket.id && room.members.length > 0) {
        room.hostId = room.members[0].id;
        room.members[0].isHost = true;
      }

      io.to(roomCode).emit("userJoined", {
        members: room.members,
      });

      if (room.members.length === 0) {
        rooms.delete(roomCode);
        console.log("🧹 Room deleted:", roomCode);
      }
    }

    console.log("❌ Disconnected:", socket.id);
  });
});

/* ---------------------------- START ---------------------------- */
const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
