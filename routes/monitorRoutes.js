const express = require("express");

// Import the route controllers
const pulseController = require("./../controllers/monitorController");
const auth = require("./../controllers/authController");

const router = express.Router();

router
  .route("/")
  .post(
    auth.protect,
    auth.restrictedTo("adminstrator"),
    pulseController.registerMonitor,
  );
router
  .route("/:id/heartbeat")
  .post(auth.protect, pulseController.sendHeartbeat);
router
  .route("/:id/pause")
  .post(
    auth.protect,
    auth.restrictedTo("technician"),
    pulseController.pauseMonitor,
  );
router
  .route("/:id/restart")
  .post(
    auth.protect,
    auth.restrictedTo("technician"),
    pulseController.restartMonitor,
  );

module.exports = router;
