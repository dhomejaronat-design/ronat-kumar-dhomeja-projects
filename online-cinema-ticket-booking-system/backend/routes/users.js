const express = require("express");
const router = express.Router();
const db = require("../db");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const JWT_SECRET = process.env.JWT_SECRET || "change-me";


function createToken(userId) {
  return jwt.sign({ userId }, JWT_SECRET, { expiresIn: "8h" });
}


const verifyToken = (req, res, next) => {

  const authHeader = req.headers["authorization"] || "";
  let token = null;

  if (authHeader.startsWith("Bearer ")) {
    token = authHeader.slice(7);
  } else if (req.headers["x-access-token"]) {
    token = req.headers["x-access-token"];
  }

  if (!token) {
    return res.status(401).json({ auth: false, message: "No token provided." });
  }

  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (err) {
      return res
        .status(401)
        .json({ auth: false, message: "Failed to authenticate token." });
    }

    req.userId = decoded.userId;
    next();
  });
};


router.post("/login", async (req, res) => {
  let { UserId, PW, userId, password } = req.body || {};

  const finalUserId = (UserId || userId || "").trim();
  const finalPw = (PW || password || "").trim();

  if (!finalUserId || !finalPw) {
   
    return res
      .status(400)
      .json({ message: "userId and password are required." });
  }

  const sql = "SELECT * FROM login WHERE UserId = ?";
  db.query(sql, [finalUserId], async (err, results) => {
    if (err) {
      console.error("Login query error:", err);
      return res.status(500).json({ message: "Server error." });
    }

    if (!results || results.length === 0) {
      return res
        .status(401)
        .json({ message: "Invalid userId or password." });
    }

    const user = results[0];
    const storedPw = user.PW || "";

    try {
      const match = await bcrypt.compare(finalPw, storedPw);
      if (!match) {
        return res
          .status(401)
          .json({ message: "Invalid userId or password." });
      }

      return res.status(200).json({
        auth: true,
        token: createToken(user.UserId),
        userId: user.UserId,
        message: "Login successful.",
      });
    } catch (e) {
      console.error("bcrypt compare error:", e);
      return res.status(500).json({ message: "Server error." });
    }
  });
});



router.get("/me", verifyToken, (req, res) => {
  const sql = "SELECT UserId FROM login WHERE UserId = ? LIMIT 1";
  db.query(sql, [req.userId], (err, rows) => {
    if (err) {
      console.error("Profile query error:", err);
      return res.status(500).json({ message: "Server error." });
    }

    if (!rows || rows.length === 0) {
      return res.status(404).json({ message: "User not found." });
    }

    res.json({ userId: rows[0].UserId });
  });
});

module.exports = { router, verifyToken };
