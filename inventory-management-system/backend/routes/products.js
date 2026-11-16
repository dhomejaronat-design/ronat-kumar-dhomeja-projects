const express = require("express");
const router = express.Router();
const db = require("../db");
const { dbError } = require("../logger");

// GET all products
router.get("/", (req, res) => {
  db.query("SELECT * FROM products", (err, results) => {
    if (err) return dbError(res, err);
    res.json(results);
  });
});

// GET the 10 newest products (must come before /:id)
router.get("/recent", (req, res) => {
  const sql = `
    SELECT p.name, p.sku, c.category_name AS category, p.quantity
    FROM products p
    LEFT JOIN categories c ON p.category_id = c.category_id
    ORDER BY p.product_id DESC
    LIMIT 10
  `;
  db.query(sql, (err, results) => {
    if (err) return dbError(res, err);
    res.json(results);
  });
});

// GET product by ID
router.get("/:id", (req, res) => {
  const id = req.params.id;

  db.query(
    "SELECT * FROM products WHERE product_id = ?",
    [id],
    (err, result) => {
      if (err) return dbError(res, err);
      if (result.length === 0) return res.status(404).send("Product not found");
      res.json(result[0]);
    }
  );
});

// GET product by name search
router.get("/search/:name", (req, res) => {
  const name = req.params.name;

  db.query(
    "SELECT * FROM products WHERE name LIKE ?",
    [`%${name}%`],
    (err, results) => {
      if (err) return dbError(res, err);
      res.json(results);
    }
  );
});

// ADD product
router.post("/", (req, res) => {
  const { name, sku, category_id, supplier_id, price_cents, quantity } = req.body;

  if (!name || !sku || !category_id || !price_cents)
    return res.status(400).send("Missing required fields");

  const sql = `
    INSERT INTO products (name, sku, category_id, supplier_id, price_cents, quantity)
    VALUES (?, ?, ?, ?, ?, ?)
  `;

  db.query(
    sql,
    [name, sku, category_id, supplier_id, price_cents, quantity || 0],
    (err, result) => {
      if (err) return dbError(res, err);
      res.json({ message: "Product added", product_id: result.insertId });
    }
  );
});

// UPDATE product
router.put("/:id", (req, res) => {
  const id = req.params.id;
  const { name, sku, category_id, supplier_id, price_cents, quantity } = req.body;

  const sql = `
    UPDATE products
    SET name=?, sku=?, category_id=?, supplier_id=?, price_cents=?, quantity=?
    WHERE product_id=?
  `;

  db.query(
    sql,
    [name, sku, category_id, supplier_id, price_cents, quantity, id],
    (err, result) => {
      if (err) return dbError(res, err);

      if (result.affectedRows === 0)
        return res.status(404).send("Product not found");

      res.json({ message: "Product updated" });
    }
  );
});

// DELETE product
router.delete("/:id", (req, res) => {
  const id = req.params.id;

  db.query(
    "DELETE FROM products WHERE product_id = ?",
    [id],
    (err, result) => {
      if (err) return dbError(res, err);

      if (result.affectedRows === 0)
        return res.status(404).send("Product not found");

      res.json({ message: "Product deleted" });
    }
  );
});

module.exports = router;
