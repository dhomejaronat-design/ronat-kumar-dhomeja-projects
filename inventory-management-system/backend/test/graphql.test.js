const { test, beforeEach } = require("node:test");
const assert = require("node:assert");
const path = require("path");

process.env.LOG_LEVEL = "silent";

// A tiny fake database that answers based on the SQL it receives.
const data = {
  categories: [{ category_id: 1, category_name: "Electronics" }],
  suppliers: [{ supplier_id: 1, name: "Acme", email: "a@acme.example", phone: null, address: null }],
  products: [
    { product_id: 1, name: "USB-C Cable", sku: "USB1", category_id: 1, supplier_id: 1, price_cents: 1299, quantity: 50 },
    { product_id: 2, name: "HDMI Cable", sku: "HDMI2", category_id: 1, supplier_id: null, price_cents: 1699, quantity: 3 },
  ],
};
let calls = [];

function answer(sql, p) {
  if (sql.startsWith("SELECT (SELECT COUNT")) return [{ totalProducts: 2, totalStock: "53", totalSuppliers: 1, totalCategories: 1 }];
  if (sql.startsWith("INSERT INTO products")) {
    const id = data.products.length + 1;
    data.products.push({ product_id: id, name: p[0], sku: p[1], category_id: p[2], supplier_id: p[3], price_cents: p[4], quantity: p[5] });
    return { insertId: id };
  }
  if (sql.startsWith("UPDATE products SET quantity")) {
    const row = data.products.find((r) => r.product_id === p[1]);
    if (row) row.quantity = p[0];
    return { affectedRows: row ? 1 : 0 };
  }
  if (sql.includes("WHERE product_id = ?")) return data.products.filter((r) => r.product_id === p[0]);
  if (sql.includes("WHERE name LIKE ?")) return data.products.filter((r) => r.name.includes(p[0].slice(1, -1)));
  if (sql.includes("WHERE quantity <= ?")) return data.products.filter((r) => r.quantity <= p[0]);
  if (sql.includes("FROM products WHERE supplier_id")) return data.products.filter((r) => r.supplier_id === p[0]);
  if (sql.includes("FROM products WHERE category_id")) return data.products.filter((r) => r.category_id === p[0]);
  if (sql.includes("FROM products")) return data.products;
  if (sql.includes("FROM categories WHERE")) return data.categories.filter((r) => r.category_id === p[0]);
  if (sql.includes("FROM categories")) return data.categories;
  if (sql.includes("FROM suppliers WHERE")) return data.suppliers.filter((r) => r.supplier_id === p[0]);
  if (sql.includes("FROM suppliers")) return data.suppliers;
  throw new Error("unexpected SQL: " + sql);
}

const dbPath = require.resolve(path.join(__dirname, "..", "db.js"));
require.cache[dbPath] = {
  id: dbPath, filename: dbPath, loaded: true,
  exports: {
    query(sql, params, cb) {
      if (typeof params === "function") [cb, params] = [params, []];
      const clean = sql.replace(/\s+/g, " ").trim();
      calls.push(clean);
      cb(null, answer(clean, params));
    },
  },
};

const app = require("../app");
let base;
const server = app.listen(0, () => { base = `http://localhost:${server.address().port}/graphql`; });
test.after(() => server.close());
beforeEach(() => { calls = []; });

async function gql(query, variables) {
  const res = await fetch(base, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  return res.json();
}

test("lists products with their category and supplier in one request", async () => {
  const { data: d } = await gql("{ products { name priceCents category { name } supplier { name } } }");
  assert.deepEqual(d.products[0], { name: "USB-C Cable", priceCents: 1299, category: { name: "Electronics" }, supplier: { name: "Acme" } });
  assert.equal(d.products[1].supplier, null);
});

test("only queries the tables a request asks for", async () => {
  await gql("{ products { name } }");
  assert.deepEqual(calls, ["SELECT * FROM products ORDER BY name"]);
});

test("search and low stock filter products", async () => {
  const { data: d } = await gql('{ products(search: "HDMI") { sku } lowStock(threshold: 5) { sku quantity } }');
  assert.deepEqual(d.products, [{ sku: "HDMI2" }]);
  assert.deepEqual(d.lowStock, [{ sku: "HDMI2", quantity: 3 }]);
});

test("stats come back as numbers", async () => {
  const { data: d } = await gql("{ stats { totalProducts totalStock } }");
  assert.deepEqual(d.stats, { totalProducts: 2, totalStock: 53 });
});

test("a supplier lists its own products", async () => {
  const { data: d } = await gql("{ suppliers { name products { sku } } }");
  assert.deepEqual(d.suppliers[0], { name: "Acme", products: [{ sku: "USB1" }] });
});

test("addProduct creates a product and returns it", async () => {
  const q = "mutation($p: NewProduct!) { addProduct(input: $p) { id name quantity category { name } } }";
  const { data: d } = await gql(q, { p: { name: "Mouse", sku: "M1", categoryId: 1, priceCents: 2500 } });
  assert.equal(d.addProduct.name, "Mouse");
  assert.equal(d.addProduct.quantity, 0);
  assert.equal(d.addProduct.category.name, "Electronics");
});

test("setStock rejects negative numbers and unknown products", async () => {
  let r = await gql("mutation { setStock(id: 1, quantity: -1) { quantity } }");
  assert.equal(r.errors[0].message, "Quantity can't be negative");
  r = await gql("mutation { setStock(id: 999, quantity: 4) { quantity } }");
  assert.equal(r.errors[0].message, "Product not found");
  r = await gql("mutation { setStock(id: 1, quantity: 7) { quantity } }");
  assert.equal(r.data.setStock.quantity, 7);
});

test("a query for a field that doesn't exist is refused", async () => {
  const r = await gql("{ products { password } }");
  assert.match(r.errors[0].message, /Cannot query field "password"/);
});
