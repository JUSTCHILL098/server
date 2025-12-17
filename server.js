import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import cors from "cors";

const app = express();
app.use(cors());

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: "https://weeb-delta.vercel.app", methods: ["GET", "POST"] }
});

const rooms = new Map();

io.on("connection", (socket) => {
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
      
      // Tell the person joining they are IN
      socket.emit("roomJoined", { ...room, isHost: false });
      
      // Tell everyone else (the host) a new person is here
      io.to(roomCode).emit("userJoined", { members: room.members, nickname: newUser.nickname });
    } else {
      socket.emit("error", "Room not found");
    }
  });

  socket.on("videoAction", (data) => {
    socket.to(data.roomCode).emit("videoAction", data);
  });

  socket.on("disconnecting", () => {
    for (const roomCode of socket.rooms) {
      const room = rooms.get(roomCode);
      if (room) {
        const leavingUser = room.members.find(m => m.id === socket.id);
        room.members = room.members.filter(m => m.id !== socket.id);
        
        if (room.members.length === 0) {
          rooms.delete(roomCode);
        } else {
          io.to(roomCode).emit("userLeft", { 
            members: room.members, 
            nickname: leavingUser?.nickname || "Someone" 
          });
        }
      }
    }
  });
});

onst PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
