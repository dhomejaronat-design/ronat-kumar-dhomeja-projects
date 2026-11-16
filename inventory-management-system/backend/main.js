const app = require("./app");
const db = require("./db");
const { logger } = require("./logger");

const PORT = Number(process.env.PORT) || 3000;

const server = app.listen(PORT, () => logger.info("server started", { port: PORT }));

// Docker and ECS send SIGTERM before stopping a container. Finish open
// requests and close database connections instead of dropping them.
function shutdown(signal) {
  logger.info("shutting down", { signal });
  server.close(() => db.end(() => process.exit(0)));
  setTimeout(() => process.exit(1), 10_000).unref();
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
