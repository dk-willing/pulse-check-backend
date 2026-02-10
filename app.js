const express = require("express");
const morgan = require("morgan");

// Import our error controller
const errorController = require("./controllers/errorController");

// Import user route
const userRouter = require("./routes/userRoutes");

// This creates our express application
const app = express();

// Development logger
if (process.env.NODE_ENV === "development") {
  app.use(morgan("dev"));
}

// body parser
app.use(express.json());

// Mount routes on our application
app.use("/api/v1/users", userRouter);

// This handle all routes not defined in our app
app.use(/(.*)/, (req, res, next) => {
  next(new AppError(`Can't find ${req.originalUrl} on this server!`, 404));
});

// Global error handler middleware
app.use(errorController);

module.exports = app;
