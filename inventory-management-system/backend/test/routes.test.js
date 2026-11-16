const { test, beforeEach } = require("node:test");
const assert = require("node:assert");
const path = require("path");

// A fake database: records every query and answers with whatever the test sets.
const fake = { calls: [], reply: [] };
const dbPath = require.resolve(path.join(__dirname, "..", "db.js"));
require.cache[dbPath] = {
  id: dbPath, filename: dbPath, loaded: true,
  exports: {
    query(sql, params, cb) {
      if (typeof params === "function") [cb, params] = [params, []];
      fake.calls.push({ sql: sql.replace(/\s+/g, " ").trim(), params });
      fake.error ? cb(fake.error) : cb(null, fake.reply);
    },
  },
};

process.env.LOG_LEVEL = "silent"; // keep request logs out of the test output
const app = require("../app");

let base;
const server = app.listen(0, () => { base = `http://localhost:${server.address().port}`; });
test.after(() => server.close());

beforeEach(() => { fake.calls = []; fake.reply = []; fake.error = null; });

const send = (method, url, body) =>
  fetch(base + url, { method, headers: { "content-type": "application/json" }, body: body && JSON.stringify(body) });

test("lists all products", async () => {
  fake.reply = [{ product_id: 1, name: "USB-C Cable 1m" }];
  const res = await send("GET", "/products");
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), fake.reply);
});

test("/products/recent runs the recent query, not the lookup by id", async () => {
  await send("GET", "/products/recent");
  assert.match(fake.calls[0].sql, /ORDER BY p.product_id DESC LIMIT 10/);
});

test("an unknown product id answers 404", async () => {
  const res = await send("GET", "/products/999");
  assert.equal(res.status, 404);
  assert.deepEqual(fake.calls[0].params, ["999"]);
});

test("adding a product without required fields answers 400", async () => {
  const res = await send("POST", "/products", { name: "Cable" });
  assert.equal(res.status, 400);
  assert.equal(fake.calls.length, 0);
});

test("adding a product passes values as parameters and defaults quantity to 0", async () => {
  fake.reply = { insertId: 7 };
  const res = await send("POST", "/products", { name: "Mouse", sku: "M-1", category_id: 1, price_cents: 2500 });
  assert.equal((await res.json()).product_id, 7);
  assert.deepEqual(fake.calls[0].params, ["Mouse", "M-1", 1, undefined, 2500, 0]);
});

test("product search uses a LIKE parameter", async () => {
  await send("GET", "/products/search/cable");
  assert.deepEqual(fake.calls[0].params, ["%cable%"]);
});

test("adding a category needs a name", async () => {
  const res = await send("POST", "/categories", {});
  assert.equal(res.status, 400);
});

test("updating a category that does not exist answers 404", async () => {
  fake.reply = { affectedRows: 0 };
  const res = await send("PUT", "/categories/9", { category_name: "Toys" });
  assert.equal(res.status, 404);
});

test("adding a supplier needs a name and stores missing fields as null", async () => {
  assert.equal((await send("POST", "/suppliers", {})).status, 400);
  fake.reply = { insertId: 4 };
  await send("POST", "/suppliers", { name: "Acme" });
  assert.deepEqual(fake.calls[0].params, ["Acme", null, null, null]);
});

test("lists the products of one supplier", async () => {
  await send("GET", "/suppliers/2/products");
  assert.match(fake.calls[0].sql, /WHERE supplier_id = \?/);
  assert.deepEqual(fake.calls[0].params, ["2"]);
});

test("adding a category accepts category_name from the frontend and returns the new id", async () => {
  fake.reply = { insertId: 5 };
  const res = await send("POST", "/categories", { category_name: "Toys" });
  assert.equal(res.status, 201);
  assert.deepEqual(await res.json(), { message: "Category added successfully", category_id: 5, category_name: "Toys" });
  assert.deepEqual(fake.calls[0].params, ["Toys"]);
});

test("dashboard stats return the four totals", async () => {
  fake.reply = [{ totalProducts: 4, totalStock: 320, totalSuppliers: 3, totalCategories: 3 }];
  const res = await send("GET", "/dashboard/stats");
  assert.deepEqual(await res.json(), fake.reply[0]);
});

test("health check reports ok when the database answers", async () => {
  const res = await send("GET", "/health");
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { status: "ok", database: "ok" });
});

test("health check answers 503 when the database is down", async () => {
  fake.error = { code: "ECONNREFUSED", message: "connect refused" };
  const res = await send("GET", "/health");
  assert.equal(res.status, 503);
});

test("database errors are hidden from the client", async () => {
  fake.error = { code: "ER_BAD_FIELD_ERROR", message: "Unknown column 'secret_col'" };
  const res = await send("GET", "/products");
  assert.equal(res.status, 500);
  assert.deepEqual(await res.json(), { message: "Database error" });
});
