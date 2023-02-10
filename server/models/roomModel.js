const mongoose = require("mongoose");

const roomSchema = new mongoose.Schema({
  roomName: {
    type: String,
    required: true,
    min: 3,
    max: 20,
  },
});

module.exports = mongoose.model("Room", roomSchema);
