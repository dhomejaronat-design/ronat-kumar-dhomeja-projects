const express = require("express");
const router = express.Router();
const db = require("../db");


router.get("/film/:filmId", (req, res) => {
  const { filmId } = req.params;
  const sql = "SELECT commentId, FilmId, UserId, Comment FROM comment WHERE FilmId = ? ORDER BY commentId DESC";
  db.query(sql, [filmId], (err, results) => {
    if (err) return res.status(500).send("Failed to retrieve comments.");
    res.json(results);
  });
});


router.post("/", (req, res) => {
  const { FilmId, UserId, Comment } = req.body;
  if (!FilmId || !UserId || !Comment) return res.status(400).send("FilmId, UserId, and Comment are required.");

  const sql = "INSERT INTO comment (FilmId, UserId, Comment) VALUES (?, ?, ?)";
  db.query(sql, [FilmId, UserId, Comment], (err, result) => {
    if (err) return res.status(500).send("Failed to post comment.");
    res.status(201).send(`Comment posted successfully! ID: ${result.insertId}`);
  });
});


router.delete("/:id", (req, res) => {
  const sql = "DELETE FROM comment WHERE commentId = ?";
  db.query(sql, [req.params.id], (err, results) => {
    if (err) return res.status(500).send(err);
    if (results.affectedRows === 0) return res.status(404).send("Comment not found");
    res.send("Comment deleted successfully!");
  });
});

module.exports = router;
