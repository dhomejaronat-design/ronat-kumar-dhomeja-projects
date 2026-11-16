const mysql = require("mysql2");
const { logger } = require("./logger");

// A pool reconnects on its own if the database restarts or drops idle
// connections, which matters for AWS RDS. Set DB_SSL=true for RDS: mysql2
// ships the Amazon RDS certificates, so no extra files are needed.
const pool = mysql.createPool({
  host: process.env.DB_HOST || "127.0.0.1",
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "",
  database: process.env.DB_NAME || "ims",
  ssl: process.env.DB_SSL === "true" ? "Amazon RDS" : undefined,
  waitForConnections: true,
  connectionLimit: Number(process.env.DB_POOL_SIZE) || 10,
  enableKeepAlive: true,
});

pool.on("connection", () => logger.info("database connection opened"));

module.exports = pool;
