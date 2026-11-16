const express = require("express");
const db = require("../db");
const { dbError } = require("../logger");
const router = express.Router();

// GET all categories
router.get("/", (req, res) => {
  db.query("SELECT * FROM categories", (err, results) => {
    if (err) return dbError(res, err);
    res.json(results);
  });
});

// GET category by ID
router.get("/:id", (req, res) => {
  const { id } = req.params;

  db.query("SELECT * FROM categories WHERE category_id = ?", [id], (err, results) => {
    if (err) return dbError(res, err);
    if (results.length === 0) return res.status(404).json({ message: "Category not found" });

    res.json(results[0]);
  });
});

// GET category by Name
router.get("/name/:name", (req, res) => {
  const { name } = req.params;

  db.query("SELECT * FROM categories WHERE category_name = ?", [name], (err, results) => {
    if (err) return dbError(res, err);
    if (results.length === 0) return res.status(404).json({ message: "Category not found" });

    res.json(results[0]);
  });
});

// ADD new category
router.post("/", (req, res) => {
  const CategoryName = req.body.category_name || req.body.CategoryName;

  if (!CategoryName) {
    return res.status(400).json({ message: "category_name is required" });
  }

  db.query("INSERT INTO categories (category_name) VALUES (?)",
    [CategoryName],
    (err, result) => {
      if (err) return dbError(res, err);

      res.status(201).json({
        message: "Category added successfully",
        category_id: result.insertId,
        category_name: CategoryName
      });
    });
});

// UPDATE category
router.put("/:id", (req, res) => {
  const { id } = req.params;
  const CategoryName = req.body.category_name || req.body.CategoryName;

  if (!CategoryName) {
    return res.status(400).json({ message: "category_name is required" });
  }

  db.query(
    "UPDATE categories SET category_name = ? WHERE category_id = ?",
    [CategoryName, id],
    (err, result) => {
      if (err) return dbError(res, err);

      if (result.affectedRows === 0) {
        return res.status(404).json({ message: "Category not found" });
      }

      res.json({ message: "Category updated successfully" });
    }
  );
});

// DELETE category
router.delete("/:id", (req, res) => {
  const { id } = req.params;

  db.query(
    "DELETE FROM categories WHERE category_id = ?",
    [id],
    (err, result) => {
      if (err) return dbError(res, err);

      if (result.affectedRows === 0) {
        return res.status(404).json({ message: "Category not found" });
      }

      res.json({ message: "Category deleted successfully" });
    }
  );
});

module.exports = router;
