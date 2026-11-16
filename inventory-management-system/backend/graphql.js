const { buildSchema, GraphQLError } = require("graphql");
const { createHandler } = require("graphql-http/lib/use/express");
const db = require("./db");
const { logger } = require("./logger");

const schema = buildSchema(`
  type Category {
    id: Int!
    name: String!
    products: [Product!]!
  }

  type Supplier {
    id: Int!
    name: String!
    email: String
    phone: String
    address: String
    products: [Product!]!
  }

  type Product {
    id: Int!
    name: String!
    sku: String!
    priceCents: Int!
    quantity: Int!
    category: Category
    supplier: Supplier
  }

  type Stats {
    totalProducts: Int!
    totalStock: Int!
    totalSuppliers: Int!
    totalCategories: Int!
  }

  input NewProduct {
    name: String!
    sku: String!
    categoryId: Int!
    supplierId: Int
    priceCents: Int!
    quantity: Int = 0
  }

  type Query {
    products(search: String): [Product!]!
    product(id: Int!): Product
    lowStock(threshold: Int = 5): [Product!]!
    categories: [Category!]!
    suppliers: [Supplier!]!
    stats: Stats!
  }

  type Mutation {
    addProduct(input: NewProduct!): Product!
    setStock(id: Int!, quantity: Int!): Product!
  }
`);

function run(sql, params = []) {
  return new Promise((resolve, reject) =>
    db.query(sql, params, (err, rows) => {
      if (err) {
        logger.error("database error", { code: err.code, message: err.message });
        return reject(new GraphQLError("Database error"));
      }
      resolve(rows);
    })
  );
}

const toCategory = (r) => r && {
  id: r.category_id,
  name: r.category_name,
  products: () => run("SELECT * FROM products WHERE category_id = ?", [r.category_id]).then((rows) => rows.map(toProduct)),
};

const toSupplier = (r) => r && {
  id: r.supplier_id,
  name: r.name,
  email: r.email,
  phone: r.phone,
  address: r.address,
  products: () => run("SELECT * FROM products WHERE supplier_id = ?", [r.supplier_id]).then((rows) => rows.map(toProduct)),
};

// Category and supplier are only fetched when the query asks for them.
const toProduct = (r) => r && {
  id: r.product_id,
  name: r.name,
  sku: r.sku,
  priceCents: r.price_cents,
  quantity: r.quantity,
  category: () => run("SELECT * FROM categories WHERE category_id = ?", [r.category_id]).then((rows) => toCategory(rows[0])),
  supplier: () => r.supplier_id == null
    ? null
    : run("SELECT * FROM suppliers WHERE supplier_id = ?", [r.supplier_id]).then((rows) => toSupplier(rows[0])),
};

const findProduct = (id) => run("SELECT * FROM products WHERE product_id = ?", [id]).then((rows) => toProduct(rows[0]));

const rootValue = {
  products: ({ search }) =>
    (search
      ? run("SELECT * FROM products WHERE name LIKE ? ORDER BY name", [`%${search}%`])
      : run("SELECT * FROM products ORDER BY name")
    ).then((rows) => rows.map(toProduct)),

  product: ({ id }) => findProduct(id),

  lowStock: ({ threshold }) =>
    run("SELECT * FROM products WHERE quantity <= ? ORDER BY quantity", [threshold]).then((rows) => rows.map(toProduct)),

  categories: () => run("SELECT * FROM categories ORDER BY category_name").then((rows) => rows.map(toCategory)),

  suppliers: () => run("SELECT * FROM suppliers ORDER BY name").then((rows) => rows.map(toSupplier)),

  stats: () =>
    run(`
      SELECT
        (SELECT COUNT(*) FROM products) AS totalProducts,
        (SELECT COALESCE(SUM(quantity), 0) FROM products) AS totalStock,
        (SELECT COUNT(*) FROM suppliers) AS totalSuppliers,
        (SELECT COUNT(*) FROM categories) AS totalCategories
    `).then((rows) => {
      const s = rows[0];
      return {
        totalProducts: Number(s.totalProducts),
        totalStock: Number(s.totalStock),
        totalSuppliers: Number(s.totalSuppliers),
        totalCategories: Number(s.totalCategories),
      };
    }),

  addProduct: async ({ input }) => {
    if (input.priceCents < 0 || input.quantity < 0) {
      throw new GraphQLError("Price and quantity can't be negative");
    }
    const res = await run(
      "INSERT INTO products (name, sku, category_id, supplier_id, price_cents, quantity) VALUES (?, ?, ?, ?, ?, ?)",
      [input.name, input.sku, input.categoryId, input.supplierId ?? null, input.priceCents, input.quantity]
    );
    return findProduct(res.insertId);
  },

  setStock: async ({ id, quantity }) => {
    if (quantity < 0) throw new GraphQLError("Quantity can't be negative");
    const res = await run("UPDATE products SET quantity = ? WHERE product_id = ?", [quantity, id]);
    if (res.affectedRows === 0) throw new GraphQLError("Product not found");
    return findProduct(id);
  },
};

module.exports = createHandler({ schema, rootValue });
