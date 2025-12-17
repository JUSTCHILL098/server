import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import cors from "cors";

const app = express();
app.use(cors());

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: "https://weeb-delta.vercel.app", // Adjust this to your Vercel URL for security later
    methods: ["GET", "POST"]
  }
});

// Store room data in memory
const rooms = new Map();

io.on("connection", (socket) => {
  console.log("🔌 Connected:", socket.id);

  // --- ROOM CREATION ---
  socket.on("createRoom", ({ nickname }) => {
    const roomCode = Math.random().toString(36).substring(2, 8).toUpperCase();
    socket.join(roomCode);

    const roomData = {
      roomCode,
      hostId: socket.id,
      members: [{ id: socket.id, nickname, isHost: true }],
      chat: []
    };

    rooms.set(roomCode, roomData);
    socket.emit("roomCreated", { 
      roomCode, 
      isHost: true, 
      members: roomData.members 
    });
  });

  // --- JOINING ROOM ---
  socket.on("joinRoom", ({ roomCode, nickname }) => {
    const room = rooms.get(roomCode);
    if (room) {
      socket.join(roomCode);
      room.members.push({ id: socket.id, nickname, isHost: false });
      
      // Tell the person joining about the room
      socket.emit("roomJoined", {
        roomCode,
        isHost: false,
        members: room.members,
        chat: room.chat
      });

      // Tell everyone else someone joined
      io.to(roomCode).emit("userJoined", { 
        members: room.members, 
        nickname 
      });
    } else {
      socket.emit("error", { message: "Room not found" });
    }
  });

  // --- VIDEO SYNC (The "Fix") ---
  socket.on("videoAction", (data) => {
    // Broadcast play/pause/seek to everyone else in the room
    socket.to(data.roomCode).emit("videoAction", {
      action: data.action,
      time: data.time
    });
  });

  // --- EPISODE SYNC ---
  socket.on("changeEpisode", (data) => {
    // Only host should usually do this, but server handles the broadcast
    socket.to(data.roomCode).emit("changeEpisode", {
      episodeId: data.episodeId,
      animeId: data.animeId,
      roomCode: data.roomCode
    });
  });

  // --- CHAT ---
  socket.on("chatMessage", ({ message }) => {
    // Find which room this socket is in
    const roomCode = Array.from(socket.rooms).find(r => r !== socket.id);
    const room = rooms.get(roomCode);

    if (room) {
      const user = room.members.find(m => m.id === socket.id);
      const chatMsg = {
        id: Date.now(),
        nickname: user ? user.nickname : "Unknown",
        message: message,
        isHost: user ? user.isHost : false,
        timestamp: Date.now()
      };
      room.chat.push(chatMsg);
      io.to(roomCode).emit("chatMessage", chatMsg);
    }
  });

  // --- DISCONNECT ---
  socket.on("disconnecting", () => {
    for (const roomCode of socket.rooms) {
      const room = rooms.get(roomCode);
      if (room) {
        const user = room.members.find(m => m.id === socket.id);
        room.members = room.members.filter(m => m.id !== socket.id);
        
        if (room.members.length === 0) {
          rooms.delete(roomCode);
        } else {
          // If host left, assign a new host
          if (user && user.isHost) {
            room.members[0].isHost = true;
            room.hostId = room.members[0].id;
            io.to(roomCode).emit("newHost", {
              newHostId: room.hostId,
              newHostNickname: room.members[0].nickname,
              members: room.members
            });
          }
          io.to(roomCode).emit("userLeft", { 
            members: room.members, 
            nickname: user ? user.nickname : "Someone" 
          });
        }
      }
    }
  });
});

const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => console.log(`🚀 Server on port ${PORT}`));
