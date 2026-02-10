const express = require("express");
const morgan = require("morgan");

// Import user route
const userRouter = require("./routes/userRoutes");

// This creates our express application
const app = express();

// Mount user route
app.use("/api/v1/users", userRouter);

module.exports = app;
