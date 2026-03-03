const device = require("./device");

const stopDevice = device("69a6ad87a1ee6f2fec8e0a34");

process.on("SIGINT", () => {
  stopDevice();
  process.exit();
});
