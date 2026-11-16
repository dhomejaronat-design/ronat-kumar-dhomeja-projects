const express = require("express");
const router = express.Router();
const db = require("../db");
const { dbError } = require("../logger");

// GET all suppliers
router.get("/", (req, res) => {
  db.query("SELECT * FROM suppliers", (err, results) => {
    if (err) return dbError(res, err);
    res.json(results);
  });
});

// GET supplier by ID
router.get("/id/:id", (req, res) => {
  const id = req.params.id;
  db.query("SELECT * FROM suppliers WHERE supplier_id = ?", [id], (err, result) => {
    if (err) return dbError(res, err);
    if (result.length === 0) return res.status(404).send("Supplier not found");
    res.json(result[0]);
  });
});

// GET supplier by name
router.get("/name/:name", (req, res) => {
  const name = req.params.name;
  db.query("SELECT * FROM suppliers WHERE name LIKE ?", [`%${name}%`], (err, results) => {
    if (err) return dbError(res, err);
    res.json(results);
  });
});

// ADD new supplier
router.post("/", (req, res) => {
  const { name, email, phone, address } = req.body;

  if (!name) return res.status(400).send("Supplier name is required");

  const sql = "INSERT INTO suppliers (name, email, phone, address) VALUES (?, ?, ?, ?)";
  db.query(sql, [name, email || null, phone || null, address || null], (err, result) => {
    if (err) return dbError(res, err);
    res.json({ message: "Supplier added", supplier_id: result.insertId });
  });
});

// UPDATE supplier
router.put("/:id", (req, res) => {
  const id = req.params.id;
  const { name, email, phone, address } = req.body;

  const sql = "UPDATE suppliers SET name=?, email=?, phone=?, address=? WHERE supplier_id=?";
  db.query(sql, [name, email, phone, address, id], (err, result) => {
    if (err) return dbError(res, err);
    if (result.affectedRows === 0) return res.status(404).send("Supplier not found");
    res.json({ message: "Supplier updated" });
  });
});

// DELETE supplier
router.delete("/:id", (req, res) => {
  const id = req.params.id;
  db.query("DELETE FROM suppliers WHERE supplier_id=?", [id], (err, result) => {
    if (err) return dbError(res, err);
    if (result.affectedRows === 0) return res.status(404).send("Supplier not found");
    res.json({ message: "Supplier deleted" });
  });
});

// GET all products by supplier ID
router.get("/:id/products", (req, res) => {
  const id = req.params.id;
  db.query(
    "SELECT * FROM products WHERE supplier_id = ?",
    [id],
    (err, results) => {
      if (err) return dbError(res, err);
      res.json(results);
    }
  );
});

module.exports = router;
