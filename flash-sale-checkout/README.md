# Flash Sale Checkout

A small checkout API for limited product drops, written in Ruby.

When 500 shoppers hit "buy" on 100 units at the same moment, a store has to
get three things right:

1. **Never oversell.** Exactly 100 orders, not 101.
2. **Never double charge.** A retried request must not create a second order.
3. **Never lose stock.** A shopper who walks away gives their units back.

This project solves those three problems with as little code as possible, and
proves it with a load test.

## How it works

| Problem | Solution | Where |
|---|---|---|
| Two shoppers take the last unit | The stock check and the update are one SQL statement: `UPDATE ... SET reserved = reserved + ? WHERE on_hand - reserved >= ?` | `lib/flash_sale/inventory.rb` |
| A bug slips past the code | The database refuses it: `CHECK (reserved <= on_hand)` | `lib/flash_sale/database.rb` |
| A cart with several products is half filled | The whole cart is one transaction. If any line is short, everything rolls back | `lib/flash_sale/checkouts.rb` |
| The shopper's app retries a request | An `Idempotency-Key` header returns the original checkout | `lib/flash_sale/checkouts.rb` |
| A shopper never pays | Holds expire after 10 minutes and the stock is released | `lib/flash_sale/checkouts.rb` |
| Rounding errors in prices | All money is whole cents. Discounts round down once, at the end | `lib/flash_sale/discounts.rb` |
| Other systems need to know about a sale | A signed `orders/paid` event (HMAC-SHA256) is written in the same transaction as the sale | `lib/flash_sale/webhooks.rb` |

A checkout moves through these states:

```
reserved --pay-----> paid
reserved --cancel--> cancelled
reserved --timeout-> expired
```

## Run it

Requires Ruby 3.1 or newer and Python 3.

```bash
bundle install
bundle exec rackup -p 9292
```

Then, in another terminal:

```bash
# put 3 shirts on sale at $25.00
curl -X POST localhost:9292/variants \
  -H 'Content-Type: application/json' \
  -d '{"sku": "tee", "name": "Launch Tee", "price_cents": 2500, "stock": 3}'

# hold 2 of them, buy one get one free
curl -X POST localhost:9292/checkouts \
  -H 'Content-Type: application/json' \
  -H 'Idempotency-Key: my-first-order' \
  -d '{"items": [{"sku": "tee", "qty": 2}], "codes": ["BOGO:tee"]}'

# pay (use the id from the reply above)
curl -X POST localhost:9292/checkouts/<id>/pay
```

## API

| Method | Path | What it does |
|---|---|---|
| `POST` | `/variants` | Create a product, or add stock to it |
| `GET` | `/variants/:sku` | On hand, reserved and available units |
| `GET` | `/inventory/low_stock?threshold=5` | Products with few units available |
| `POST` | `/checkouts` | Hold stock and price the cart. Send `Idempotency-Key` |
| `GET` | `/checkouts/:id` | Look up a checkout |
| `POST` | `/checkouts/:id/pay` | Turn the hold into a sale |
| `POST` | `/checkouts/:id/cancel` | Give the stock back |
| `GET` | `/events` | Signed `orders/paid` events |

Discount codes: `SAVE10` (10% off) and `BOGO:<sku>` (every second unit free).
BOGO applies first. A repeated code counts once. Unknown codes are ignored.

| Status | Meaning |
|---|---|
| `201` | Checkout created |
| `200` | Success, or a retry that returned the original checkout |
| `404` | Unknown product or checkout |
| `409` | Not enough stock, wrong state, or an idempotency key reused for a different cart |
| `410` | The hold expired |
| `422` | The request is not valid |

## Tests

```bash
bundle exec rake test
```

41 Minitest tests cover pricing rules, stock holds, expiry, idempotency,
signed events, the HTTP API and races between threads (for example, 50
threads racing for 10 units must sell exactly 10).

| File | What it checks |
|---|---|
| `test/discounts_test.rb` | SAVE10, BOGO, code order, rounding |
| `test/inventory_test.rb` | Stock math, low stock report, the database `CHECK` |
| `test/checkouts_test.rb` | Holds, paying, cancelling, expiry, idempotency keys, signed events |
| `test/concurrency_test.rb` | Threads racing for the same units and the same key |
| `test/api_test.rb` | The HTTP routes and status codes |

## Load test

With the server running:

```bash
python3 loadtest/flash_sale.py --stock 100 --buyers 500
```

The script races shoppers against the API over HTTP, retries half of the
checkout requests with the same idempotency key, and fails unless:

- exactly `stock` units were sold
- every other shopper was told it sold out
- no stock is left on hand or held
- there is one order event per sale
- no retry created a second checkout

It prints throughput and latency so you can see the effect of a change.

## Project layout

```
config.ru                  starts the server
lib/flash_sale/app.rb      HTTP routes (plain Rack)
lib/flash_sale/checkouts.rb  holds, payment, expiry, idempotency
lib/flash_sale/inventory.rb  stock counts and the conditional UPDATE
lib/flash_sale/discounts.rb  pricing rules
lib/flash_sale/webhooks.rb   HMAC-SHA256 signing
lib/flash_sale/database.rb   schema and connection pool
test/                      Minitest suite
loadtest/flash_sale.py     HTTP load test (Python standard library only)
```

## Design choices

- **Plain Rack, not Rails.** The interesting part is the checkout logic, so
  the web layer is one small file. The same classes would drop into a Rails
  app as models and services.
- **SQLite.** It keeps setup to one command. The conditional `UPDATE` works
  the same way in MySQL or PostgreSQL.
- **A hand written connection pool.** Each request borrows one connection, so
  two threads never share a transaction.

## What I would do next

- Send events to subscriber URLs with retries, instead of only storing them
- Move to PostgreSQL and row level locks to allow many writers at once
- Rate limit checkout attempts per shopper

## License

MIT
