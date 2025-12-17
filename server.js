import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import cors from "cors";

const app = express();
app.use(cors());

// A simple home page so you know the server is alive
app.get("/", (req, res) => {
  res.send("Server is running! 🚀");
});

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: "https://weeb-delta.vercel.app", // Allows any website to connect
    methods: ["GET", "POST"]
  }
});

const rooms = new Map();

io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  socket.on("createRoom", ({ nickname }) => {
    const roomCode = Math.random().toString(36).substring(2, 8).toUpperCase();
    socket.join(roomCode);
    const roomData = {
      roomCode,
      hostId: socket.id,
      members: [{ id: socket.id, nickname: nickname || "Host", isHost: true }],
    };
    rooms.set(roomCode, roomData);
    socket.emit("roomCreated", roomData);
  });

  socket.on("joinRoom", ({ roomCode, nickname }) => {
    const room = rooms.get(roomCode);
    if (room) {
      socket.join(roomCode);
      const newUser = { id: socket.id, nickname: nickname || "Guest", isHost: false };
      room.members.push(newUser);
      socket.emit("roomJoined", { ...room, isHost: false });
      io.to(roomCode).emit("userJoined", { members: room.members, nickname: newUser.nickname });
    } else {
      socket.emit("error", "Room not found");
    }
  });

  socket.on("videoAction", (data) => {
    // Sends play/pause to everyone else in the room
    socket.to(data.roomCode).emit("videoAction", data);
  });

  socket.on("disconnecting", () => {
    for (const roomCode of socket.rooms) {
      const room = rooms.get(roomCode);
      if (room) {
        room.members = room.members.filter(m => m.id !== socket.id);
        if (room.members.length === 0) {
          rooms.delete(roomCode);
        } else {
          io.to(roomCode).emit("userLeft", { members: room.members });
        }
      }
    }
  });
});

const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => console.log(`🚀 Server on port ${PORT}`));
