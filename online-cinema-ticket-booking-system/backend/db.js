const mysql = require("mysql2");

const con = mysql.createConnection({
  host: process.env.DB_HOST || "localhost",
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "",
  database: process.env.DB_NAME || "cinemaverse"
});

con.connect(err => {
  if (err) throw err;
  console.log("MySQL connected!");
});

module.exports = con;