const device = require("./device");

const stopDevice = device("698bc6f59dc7d602ffea3bda");

console.log("Device 123 sending heartbeat!");

process.on("SIGINT", () => {
  stopDevice();
  process.exit();
});
