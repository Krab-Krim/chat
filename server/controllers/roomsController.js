const Rooms = require("../models/roomModel");

module.exports.getRooms = async (req, res, next) => {
  try {
  } catch (ex) {
    next(ex);
  }
};

module.exports.getAllRooms = async (req, res, next) => {
  try {
    const list = await Rooms.find();
    res.status(200).send(list);
  } catch (ex) {
    next(ex);
  }
};
