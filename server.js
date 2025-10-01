// server.js
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static("public"));

const rooms = {}; // track users per room

io.on("connection", (socket) => {
  console.log("Client connected:", socket.id);

  socket.on("join", (roomId, username) => {
    socket.join(roomId);
    socket.roomId = roomId;
    socket.username = username;

    // track users for read receipts
    if(!rooms[roomId]) rooms[roomId] = {};
    rooms[roomId][socket.id] = { username, lastReadId: null };

    io.to(roomId).emit("chat", {
      id: Date.now() + "-" + Math.random().toString(36).substr(2,5),
      user: "System",
      text: `${username} joined the room.`,
      time: new Date().toLocaleTimeString(),
      avatar: null,
      reactions: [],
      type: "system"
    });
  });

  // Chat message
  socket.on("chat", (msg) => {
    if (!socket.roomId) return;
    msg.id = Date.now() + "-" + Math.random().toString(36).substr(2,5);
    msg.reactions = [];
    msg.avatar = socket.username; // store username for avatar
    io.to(socket.roomId).emit("chat", msg);
  });

  // Typing indicator
  socket.on("typing", (isTyping) => {
    if (!socket.roomId) return;
    socket.to(socket.roomId).emit("typing", { username: socket.username, typing: isTyping });
  });

  // Reaction
  socket.on("reaction", ({ messageId, emoji }) => {
    if (!socket.roomId) return;
    io.to(socket.roomId).emit("reaction", { messageId, emoji, username: socket.username });
  });

  // Read receipt
  socket.on("read", (messageId) => {
    if (!socket.roomId) return;
    rooms[socket.roomId][socket.id].lastReadId = messageId;
    io.to(socket.roomId).emit("readUpdate", rooms[socket.roomId]);
  });

  // Disconnect
  socket.on("disconnect", () => {
    if (socket.roomId && rooms[socket.roomId]) {
      delete rooms[socket.roomId][socket.id];
      io.to(socket.roomId).emit("chat", {
        id: Date.now() + "-" + Math.random().toString(36).substr(2,5),
        user: "System",
        text: `${socket.username || "User"} left the room.`,
        time: new Date().toLocaleTimeString(),
        avatar: null,
        reactions: [],
        type: "system"
      });
    }
    console.log("Client disconnected:", socket.id);
  });
});

server.listen(3000, () => console.log("Chat server running at http://localhost:3000"));
