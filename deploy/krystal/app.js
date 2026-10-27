// Start file for Krystal's cPanel "Setup Node.js App" (CloudLinux + Phusion Passenger).
// cPanel reserves the app folder's node_modules for its own use, so the self-contained
// Next.js build lives in ./build with its own node_modules, and this file starts it.
const path = require("node:path");

process.env.NODE_ENV = "production";
// The server's shell sets HOSTNAME to the machine name; Next.js would try to listen on it.
process.env.HOSTNAME = "127.0.0.1";
process.env.PORT = process.env.PORT || "3000";

process.chdir(path.join(__dirname, "build"));
require("./build/server.js");
