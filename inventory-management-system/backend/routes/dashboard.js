const express = require("express");
const router = express.Router();
const db = require("../db");
const { dbError } = require("../logger");

// GET /dashboard/stats
router.get("/stats", (req, res) => {
  const sql = `
    SELECT
      (SELECT COUNT(*) FROM products) AS totalProducts,
      (SELECT COALESCE(SUM(quantity), 0) FROM products) AS totalStock,
      (SELECT COUNT(*) FROM suppliers) AS totalSuppliers,
      (SELECT COUNT(*) FROM categories) AS totalCategories
  `;

  db.query(sql, (err, results) => {
    if (err) return dbError(res, err);

    res.json(results[0]);
  });
});

module.exports = router;
