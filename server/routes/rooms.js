const { getAllRooms } = require("../controllers/roomsController");
const router = require("express").Router();

router.get("/rooms/", getAllRooms);

module.exports = router;