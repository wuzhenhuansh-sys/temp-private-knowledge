import app from "./app";
import { config } from "./lib/config";

console.log(`[private-knowledge] Starting server on ${config.host}:${config.port}`);

export default {
  port: config.port,
  hostname: config.host,
  fetch: app.fetch,
};
