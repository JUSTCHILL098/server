import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import cors from "cors";

const app = express();

// This allows your website to talk to the server
app.use(cors({
    origin: "https://weeb-delta.vercel.app",
    methods: ["GET", "POST"]
}));

app.get("/", (req, res) => {
    res.send("Server is alive! 🚀");
});

const httpServer = createServer(app);

const io = new Server(httpServer, {
    cors: {
        origin: "https://weeb-delta.vercel.app", // ALLOW EVERYTHING
        methods: ["GET", "POST"],
        credentials: true
    },
    transports: ['websocket', 'polling'] // Forces connection even on bad networks
});

const rooms = new Map();

io.on("connection", (socket) => {
    console.log("New connection attempt from:", socket.id);

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
        console.log(`Room Created: ${roomCode}`);
    });

    socket.on("joinRoom", ({ roomCode, nickname }) => {
        const room = rooms.get(roomCode);
        if (room) {
            socket.join(roomCode);
            const newUser = { id: socket.id, nickname: nickname || "Guest", isHost: false };
            room.members.push(newUser);
            socket.emit("roomJoined", { ...room, isHost: false });
            io.to(roomCode).emit("userJoined", { members: room.members, nickname: newUser.nickname });
            console.log(`${nickname} joined room: ${roomCode}`);
        } else {
            socket.emit("error", "Room not found");
        }
    });

    socket.on("videoAction", (data) => {
        socket.to(data.roomCode).emit("videoAction", data);
    });

    socket.on("disconnect", () => {
        console.log("User disconnected:", socket.id);
    });
});

const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 SERVER DEPLOYED ON PORT ${PORT}`);
});
