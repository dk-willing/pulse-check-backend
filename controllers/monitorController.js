const Monitor = require("../model/monitorModel");
const catchAsync = require("../utils/catchAsync");
const AppError = require("./../utils/error");
const sendEmail = require("../utils/sendEmail");

// Create timer
function createTimer(monitor) {
  if (monitor.timer) {
    clearTimeout(monitor.timer);
  }
  monitor.timer = setTimeout(
    () => {
      if (!monitor.pause) {
        console.log({
          ALERT: `Device - ${monitor.name} is down`,
          OccuredAt: new Date().toISOString(),
          EmailSentTo: `${monitor.alert_email}`,
        });

        sendEmail({
          to: monitor.alert_email,
          subject: `Device "${monitor.name}" is down`,
          message: `"${monitor.name}" - This device's connection has been lost and needs your attention now!`,
        });
      }
    },
    monitor.timeout * 1000 + 10000,
  );

  console.log(monitor.timer);

  monitor.expiresAt = new Date(Date.now() + monitor.timeout * 1000 + 10000);
  monitor.save();
}

exports.registerMonitor = catchAsync(async (req, res, next) => {
  const { name, timeout, alert_email } = req.body;

  let monitor = await Monitor.create({
    name,
    timeout,
    alert_email,
  });

  createTimer(monitor);

  res.status(201).json({
    status: "success",
    data: {
      monitor,
    },
  });
});

exports.sendHeartbeat = catchAsync(async (req, res, next) => {
  const id = req.params.id;

  let monitor = await Monitor.findOne({ _id: id });

  if (!monitor) {
    return next(new AppError("No monitor was found with this id", 404));
  }

  monitor.pause = false;
  createTimer(monitor);

  res.status(200).json({
    status: "success",
    message: "Timer reset successful",
  });
});

exports.pauseMonitor = catchAsync(async (req, res, next) => {
  const id = req.params.id;

  let monitor = await Monitor.findOne({ _id: id });
  console.log(monitor);

  if (!monitor) {
    return next(new AppError("No monitor was found with this id", 404));
  }

  monitor.pause = true;
  await monitor.save();

  res.status(200).json({
    status: "paused",
    message: "A technician paused this monitor",
  });
});

exports.restartMonitor = catchAsync(async (req, res, next) => {
  const id = req.params.id;

  let monitor = await Monitor.findOne({ _id: id });

  if (!monitor) {
    return next(new AppError("No monitor was found with this id", 404));
  }

  monitor.pause = false;
  createTimer(monitor);

  res.status(200).json({
    status: "success",
    message: "Monitor started successfully",
    data: {
      monitor,
    },
  });
});

exports.getAllMonitors = catchAsync(async (req, res, next) => {
  const monitors = await Monitor.find();

  res.status(200).json({
    status: "success",
    data: {
      monitors,
    },
  });
});
