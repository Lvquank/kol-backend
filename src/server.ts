import { buildApp } from "./app.js";
import { config } from "./config.js";

const app = await buildApp();

async function shutdown(signal: string) {
  app.log.info({ signal }, "Shutting down");
  try {
    await app.close();
    process.exit(0);
  } catch (error) {
    app.log.error(error, "Graceful shutdown failed");
    process.exit(1);
  }
}

process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));

try {
  await app.listen({ host: config.host, port: config.port });
  app.log.info(`API documentation: http://localhost:${config.port}/docs`);
} catch (error) {
  app.log.error(error, "Unable to start the API server");
  process.exit(1);
}
