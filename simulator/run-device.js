const device = require("./device");

const stopDevice = device("698bcaadc1f00c1c8f7879cf");

console.log("Device 123 sending heartbeat!");

process.on("SIGINT", () => {
  stopDevice();
  process.exit();
});
