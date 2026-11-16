const express = require("express");
const router = express.Router();
const db = require("../db");
const path = require("path");
const fs = require("fs");
const multer = require("multer");


const uploadsRoot = path.join(__dirname, "..", "uploads");
const postersDir = path.join(uploadsRoot, "posters");
const trailersDir = path.join(uploadsRoot, "trailers");

[uploadsRoot, postersDir, trailersDir].forEach((dir) => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});


const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    if (file.fieldname === "poster") {
      cb(null, postersDir);
    } else if (file.fieldname === "trailer") {
      cb(null, trailersDir);
    } else {
      cb(null, uploadsRoot);
    }
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const base = path
      .basename(file.originalname, ext)
      .replace(/\s+/g, "-")
      .toLowerCase();
    cb(null, `${base}-${Date.now()}${ext}`);
  },
});

const upload = multer({ storage });


function normaliseDuration(duration) {
  if (!duration) return "0";
  const num = parseInt(duration, 10);
  if (isNaN(num)) return "0";
  return String(num);
}


router.get("/", (req, res) => {
  let sql = "SELECT * FROM film";
  const where = [];
  const params = [];

  if (req.query.category) {
    where.push("Category = ?");
    params.push(req.query.category);
  }
  if (req.query.language) {
    where.push("Language = ?");
    params.push(req.query.language);
  }
  if (req.query.search) {
    where.push("FilmName LIKE ?");
    params.push(`%${req.query.search}%`);
  }

  if (where.length > 0) {
    sql += " WHERE " + where.join(" AND ");
  }

  sql += " ORDER BY FilmId ASC";

  db.query(sql, params, (err, rows) => {
    if (err) return res.status(500).send(err);
    res.json(rows);
  });
});


router.get("/:id", (req, res) => {
  const sql = "SELECT * FROM film WHERE FilmId = ?";
  db.query(sql, [req.params.id], (err, rows) => {
    if (err) return res.status(500).send(err);
    if (rows.length === 0) {
      return res.status(404).send("Film not found");
    }
    res.json(rows[0]);
  });
});


router.get("/search/:name", (req, res) => {
  const sql = "SELECT * FROM film WHERE FilmName LIKE ?";
  db.query(sql, [`%${req.params.name}%`], (err, rows) => {
    if (err) return res.status(500).send(err);
    res.json(rows);
  });
});


router.post(
  "/",
  upload.fields([
    { name: "poster", maxCount: 1 },
    { name: "trailer", maxCount: 1 },
  ]),
  (req, res) => {
    const {
      FilmName,
      Duration,
      Category,
      Language,
      Director,
      Description,
    } = req.body;

    if (!FilmName || !Duration || !Category) {
      return res
        .status(400)
        .send("Missing required fields (FilmName, Duration, Category)");
    }

    const normalisedDuration = normaliseDuration(Duration);

    const posterFile =
      req.files && req.files["poster"] && req.files["poster"][0]
        ? req.files["poster"][0]
        : null;
    const trailerFile =
      req.files && req.files["trailer"] && req.files["trailer"][0]
        ? req.files["trailer"][0]
        : null;

    const posterPath = posterFile
      ? `/uploads/posters/${posterFile.filename}`
      : "";
    const trailerPath = trailerFile
      ? `/uploads/trailers/${trailerFile.filename}`
      : "";


    db.query(
      "SELECT FilmId FROM film WHERE FilmName = ?",
      [FilmName],
      (err, existing) => {
        if (err) return res.status(500).send(err);
        if (existing.length > 0) {
          return res.status(409).send("Film already exists");
        }

       
        const insertSql = `
          INSERT INTO film
            (FilmName, Duration, Category, Language, Director, Description, Poster, Trailer)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `;

        const values = [
          FilmName,
          normalisedDuration,
          Category,
          Language || "",
          Director || "",
          Description || "",
          posterPath,
          trailerPath,
        ];

        db.query(insertSql, values, (err2, result) => {
          if (err2) return res.status(500).send(err2);

          db.query(
            "SELECT * FROM film WHERE FilmId = ?",
            [result.insertId],
            (err3, rows2) => {
              if (err3) return res.status(500).send(err3);
              res
                .status(201)
                .json({ message: "Film added successfully!", film: rows2[0] });
            }
          );
        });
      }
    );
  }
);


router.delete("/:id", (req, res) => {
  const id = req.params.id;
  const sql = "DELETE FROM film WHERE FilmId = ?";

  db.query(sql, [id], (err, result) => {
    if (err) return res.status(500).send(err);
    if (result.affectedRows === 0) {
      return res.status(404).send("Movie not found");
    }
    res.json({ message: "Movie deleted successfully!" });
  });
});


router.put(
  "/:id",
  upload.fields([
    { name: "poster", maxCount: 1 },
    { name: "trailer", maxCount: 1 },
  ]),
  (req, res) => {
    const filmId = req.params.id;
    const {
      FilmName,
      Duration,
      Category,
      Language,
      Director,
      Description,
    } = req.body;

    if (!FilmName || !Duration || !Category) {
      return res
        .status(400)
        .send("Missing required fields (FilmName, Duration, Category)");
    }

    const normalisedDuration = normaliseDuration(Duration);

    const posterFile =
      req.files && req.files["poster"] && req.files["poster"][0]
        ? req.files["poster"][0]
        : null;
    const trailerFile =
      req.files && req.files["trailer"] && req.files["trailer"][0]
        ? req.files["trailer"][0]
        : null;


    db.query("SELECT * FROM film WHERE FilmId = ?", [filmId], (err, rows) => {
      if (err) return res.status(500).send(err);
      if (rows.length === 0) {
        return res.status(404).send("Film not found");
      }

      const existing = rows[0];

      const newPosterPath = posterFile
        ? `/uploads/posters/${posterFile.filename}`
        : existing.Poster || "";

      const newTrailerPath = trailerFile
        ? `/uploads/trailers/${trailerFile.filename}`
        : existing.Trailer || "";

      const updateSql = `
        UPDATE film
        SET FilmName = ?, Duration = ?, Category = ?, Language = ?, Director = ?, Description = ?, Poster = ?, Trailer = ?
        WHERE FilmId = ?
      `;

      const values = [
        FilmName,
        normalisedDuration,
        Category,
        Language || "",
        Director || "",
        Description || "",
        newPosterPath,
        newTrailerPath,
        filmId,
      ];

      db.query(updateSql, values, (err2, result) => {
        if (err2) return res.status(500).send(err2);
        if (result.affectedRows === 0) {
          return res.status(404).send("Film not found");
        }

        db.query(
          "SELECT * FROM film WHERE FilmId = ?",
          [filmId],
          (err3, rows2) => {
            if (err3) return res.status(500).send(err3);
            res.json({
              message: "Film updated successfully!",
              film: rows2[0],
            });
          }
        );
      });
    });
  }
);

module.exports = router;
