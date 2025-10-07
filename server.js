// server.js
require("dotenv").config();
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const mongoose = require("mongoose");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static("public"));

// MongoDB connection
mongoose
  .connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => console.log("✅ MongoDB Connected"))
  .catch((err) => console.error("❌ MongoDB Error:", err));

// MongoDB schemas
const RoomSchema = new mongoose.Schema({
  roomId: { type: String, required: true },
  users: [{ name: String, joinedAt: { type: Date, default: Date.now } }],
});
const Room = mongoose.model("Room", RoomSchema);

const MessageSchema = new mongoose.Schema(
  {
    roomId: String,
    user: String,
    text: String,
    time: String,
    type: { type: String, default: "chat" },
    reactions: [String],
    avatar: String,
  },
  { timestamps: true }
);
const Message = mongoose.model("Message", MessageSchema);

// In-memory room tracking
const rooms = {};

io.on("connection", (socket) => {
  console.log("Client connected:", socket.id);

  // ----- User joins a room -----
  socket.on("join", async (roomId, username) => {
    if (!roomId || !username) return;

    // ✅ Prevent duplicate usernames in same room
    const clients = await io.in(roomId).fetchSockets();
    const nameTaken = clients.some((client) => client.username === username);
    if (nameTaken) {
      socket.emit("joinError", "❌ This username is already taken in this room!");
      return;
    }

    socket.join(roomId);
    socket.roomId = roomId;
    socket.username = username;

    if (!rooms[roomId]) rooms[roomId] = {};
    rooms[roomId][socket.id] = { username, lastReadId: null };

    // Save room + user permanently in MongoDB
    let room = await Room.findOne({ roomId });
    if (!room) {
      room = new Room({ roomId, users: [] });
    }
    room.users.push({ name: username });
    await room.save();

    // Send old messages
    const oldMessages = await Message.find({ roomId }).sort({ createdAt: 1 });
    socket.emit("chatHistory", oldMessages);

    // System message
    const joinMsg = {
      id: Date.now() + "-" + Math.random().toString(36).substr(2, 5),
      user: "System",
      text: `${username} joined the room.`,
      time: new Date().toLocaleTimeString(),
      avatar: null,
      reactions: [],
      type: "system",
    };
    io.to(roomId).emit("chat", joinMsg);

     const usersInRoom = Object.values(rooms[roomId]).map(user => user.username);
     io.to(roomId).emit("roomData", {
      roomId: roomId,
      users: usersInRoom,
      userCount: usersInRoom.length,
    });

     socket.on("disconnect", async () => {
    const roomId = socket.roomId; // Get roomId before it's gone
    if (roomId && rooms[roomId] && rooms[roomId][socket.id]) {
      // ... (your existing disconnect code to delete the user and broadcast a leave message)
      delete rooms[roomId][socket.id];
      // ...

      // Check if the room still exists in memory before sending the update
      if (rooms[roomId]) {
        const usersInRoom = Object.values(rooms[roomId]).map(user => user.username);
        
        // ✅ ADD THIS: Broadcast the updated user list after someone leaves
        io.to(roomId).emit("roomData", {
          roomId: roomId,
          users: usersInRoom,
          userCount: usersInRoom.length,
        });
      }

      // ... (your existing cleanup logic)
    }
    console.log("Client disconnected:", socket.id);
  });

  });

  // ----- Chat message -----
  socket.on("chat", async (msg) => {
    if (!socket.roomId) return;

    msg.id = Date.now() + "-" + Math.random().toString(36).substr(2, 5);
    msg.reactions = [];
    msg.avatar = socket.username;

    // Save message to MongoDB
    const newMsg = new Message({
      roomId: socket.roomId,
      user: socket.username,
      text: msg.text,
      time: new Date().toLocaleTimeString(),
      type: msg.type || "chat",
      reactions: [],
      avatar: socket.username,
    });
    await newMsg.save();

    io.to(socket.roomId).emit("chat", msg);
  });

  // ----- Typing -----
  socket.on("typing", (isTyping) => {
    if (!socket.roomId) return;
    socket
      .to(socket.roomId)
      .emit("typing", { username: socket.username, typing: isTyping });
  });

  // ----- Reaction -----
  socket.on("reaction", ({ messageId, emoji }) => {
    if (!socket.roomId) return;
    io.to(socket.roomId).emit("reaction", {
      messageId,
      emoji,
      username: socket.username,
    });
  });

  // ----- Read receipt -----
  socket.on("read", (messageId) => {
    if (!socket.roomId) return;
    rooms[socket.roomId][socket.id].lastReadId = messageId;
    io.to(socket.roomId).emit("readUpdate", rooms[socket.roomId]);
  });

  // ----- Disconnect -----
  socket.on("disconnect", async () => {
    if (socket.roomId && rooms[socket.roomId]) {
      delete rooms[socket.roomId][socket.id];

      // Broadcast user left
      const leaveMsg = {
        id: Date.now() + "-" + Math.random().toString(36).substr(2, 5),
        user: "System",
        text: `${socket.username || "User"} left the room.`,
        time: new Date().toLocaleTimeString(),
        avatar: null,
        reactions: [],
        type: "system",
      };
      io.to(socket.roomId).emit("chat", leaveMsg);

      // ✅ If room empty → delete chats & room
      if (Object.keys(rooms[socket.roomId]).length === 0) {
        console.log(`Cleaning up room: ${socket.roomId}`);

        await Message.deleteMany({ roomId: socket.roomId });      // this line automatically delete chat after leave
        await Room.deleteOne({ roomId: socket.roomId });    // this line automatically delete user after leave

        delete rooms[socket.roomId];
      }
    }
    console.log("Client disconnected:", socket.id);
  });
});


server.listen(process.env.PORT, () =>
  console.log("🚀 Chat server running at http://localhost:3000")
);
