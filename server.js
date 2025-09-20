import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import cors from "cors";

const app = express();

// Allow your frontend
app.use(cors({
  origin: "https://weeb-delta.vercel.app",
  methods: ["GET", "POST"],
  credentials: true
}));

const httpServer = createServer(app);

const io = new Server(httpServer, {
  cors: {
    origin: "https://weeb-delta.vercel.app",
    methods: ["GET", "POST"],
    credentials: true
  }
});

// Test route
app.get("/", (req, res) => {
  res.send("Server is running ✅");
});

io.on("connection", (socket) => {
  console.log("🔌 Client connected:", socket.id);

  socket.on("message", (msg) => {
    console.log("📩 Message:", msg);
    io.emit("message", msg); // broadcast
  });

  socket.on("disconnect", () => {
    console.log("❌ Client disconnected:", socket.id);
  });
});

const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
