// One JSON object per line on stdout. Docker and CloudWatch Logs both read
// stdout, and CloudWatch Logs Insights can filter on these fields directly.
function log(level, msg, fields = {}) {
  if (process.env.LOG_LEVEL === "silent") return;
  const line = JSON.stringify({ time: new Date().toISOString(), level, msg, ...fields });
  (level === "error" ? process.stderr : process.stdout).write(line + "\n");
}

const logger = {
  info: (msg, fields) => log("info", msg, fields),
  warn: (msg, fields) => log("warn", msg, fields),
  error: (msg, fields) => log("error", msg, fields),
};

// Logs every request with its status and how long it took.
function requestLogger(req, res, next) {
  const start = process.hrtime.bigint();
  res.on("finish", () => {
    const ms = Number(process.hrtime.bigint() - start) / 1e6;
    const level = res.statusCode >= 500 ? "error" : res.statusCode >= 400 ? "warn" : "info";
    log(level, "request", {
      method: req.method,
      path: req.originalUrl,
      status: res.statusCode,
      ms: Math.round(ms * 10) / 10,
    });
  });
  next();
}

// Logs the real database error but never sends it to the client.
function dbError(res, err) {
  logger.error("database error", { code: err.code, message: err.message });
  return res.status(500).json({ message: "Database error" });
}

module.exports = { logger, requestLogger, dbError };
