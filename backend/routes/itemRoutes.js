const express = require("express");
const router = express.Router();

const { verifyToken } = require("../middleware/authMiddleware");
const { permit } = require("../middleware/authorize");
const {
	createItem,
	getItems,
	getItemById,
	updateItem,
	deleteItem
} = require("../controllers/itemController");

router.post("/", verifyToken, permit("ADMIN", "MANAGER"), createItem);
router.get("/", verifyToken, permit("ADMIN", "MANAGER", "EMPLOYEE"), getItems);
router.get("/:id", verifyToken, permit("ADMIN", "MANAGER", "EMPLOYEE"), getItemById);
router.put("/:id", verifyToken, permit("ADMIN", "MANAGER"), updateItem);
router.delete("/:id", verifyToken, permit("ADMIN"), deleteItem);

module.exports = router;
