const mongoose = require("mongoose");

const RoomSchema = new mongoose.Schema({
  roomId: { type: String, required: true },
  users: [{ name: String, joinedAt: { type: Date, default: Date.now } }]
});

module.exports = mongoose.model("Room", RoomSchema);
