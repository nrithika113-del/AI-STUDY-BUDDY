const router = require("express").Router();

const { protect } = require("../middleware/auth");

const {
  getAllUsers,
  deleteUser,
  getStats,
} = require("../controllers/adminController");

// All admin routes require authentication
router.use(protect);

// Admin routes
router.get("/users", getAllUsers);

router.delete("/users/:id", deleteUser);

router.get("/stats", getStats);

module.exports = router;