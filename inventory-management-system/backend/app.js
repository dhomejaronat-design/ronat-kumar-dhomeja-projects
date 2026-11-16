const express = require("express");
const cors = require("cors");
const db = require("./db");
const { logger, requestLogger } = require("./logger");

const app = express();

app.use(cors({ origin: (process.env.CORS_ORIGIN || "http://localhost:4200").split(",") }));
app.use(express.json());
app.use(requestLogger);

// Used by Docker, load balancers and ECS to check the service is alive.
app.get("/health", (req, res) => {
  db.query("SELECT 1", (err) => {
    if (err) {
      logger.error("health check failed", { code: err.code });
      return res.status(503).json({ status: "down", database: "unreachable" });
    }
    res.json({ status: "ok", database: "ok" });
  });
});

app.use("/categories", require("./routes/categories"));
app.use("/suppliers", require("./routes/suppliers"));
app.use("/products", require("./routes/products"));
app.use("/dashboard", require("./routes/dashboard"));
app.all("/graphql", require("./graphql"));

app.get("/", (req, res) => res.send("Inventory API is running"));

// Anything that throws ends up here, logged once with its stack.
app.use((err, req, res, next) => {
  logger.error("unhandled error", { message: err.message, stack: err.stack, path: req.originalUrl });
  res.status(500).json({ message: "Server error" });
});

module.exports = app;
