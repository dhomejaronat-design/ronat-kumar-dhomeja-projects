const express = require("express");
const router = express.Router();
const db = require("../db");


router.get("/", (req, res) => {
  const sql = "SELECT * FROM Cinema";
  db.query(sql, (err, results) => {
    if (err) return res.status(500).send("Failed to retrieve cinema list.");
    res.json(results);
  });
});


router.get("/:id", (req, res) => {
  const sql = "SELECT * FROM Cinema WHERE CinemaId = ?";
  db.query(sql, [req.params.id], (err, results) => {
    if (err) return res.status(500).send("Failed to retrieve cinema details.");
    if (results.length === 0) return res.status(404).send("Cinema house not found");
    res.json(results[0]);
  });
});


router.post("/", (req, res) => {
  const { CinRow, CinCol } = req.body;
  if (!CinRow || !CinCol) return res.status(400).send("CinRow and CinCol are required.");

  const sql = "INSERT INTO Cinema (CinRow, CinCol) VALUES (?, ?)";
  db.query(sql, [CinRow, CinCol], (err, result) => {
    if (err) return res.status(500).send("Failed to add new cinema house.");
    res.status(201).send(`Cinema house added successfully! ID: ${result.insertId}`);
  });
});


router.put("/:id", (req, res) => {
  const { CinRow, CinCol } = req.body;
  const sql = "UPDATE Cinema SET CinRow=?, CinCol=? WHERE CinemaId=?";
  db.query(sql, [CinRow, CinCol, req.params.id], (err, results) => {
    if (err) return res.status(500).send("Failed to update cinema layout.");
    if (results.affectedRows === 0) return res.status(404).send("Cinema house not found");
    res.send("Cinema layout updated successfully!");
  });
});

module.exports = router;