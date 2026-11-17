# Payment Ledger

A small payments API in JavaScript (Node.js, no dependencies) that handles the three things that go wrong with money in software: charging someone twice, losing track of where money went, and fraud.

## Run it

```bash
npm start      # API on http://localhost:3000
npm test       # 9 tests with a coverage report
```

Needs Node.js 20 or newer.

## Try it

```bash
curl -X POST localhost:3000/payments \
  -H "Idempotency-Key: order-42" \
  -d '{"card":"c1","merchant":"shop","cents":500}'

curl -X POST localhost:3000/payments/<id>/refund -d '{"cents":200}'
curl localhost:3000/balances/merchant:shop
```

## The three ideas

**1. Idempotency keys (never charge twice).** If your phone loses signal after you tap Pay, the app sends the request again. Without protection you get charged twice. Here every charge needs an `Idempotency-Key`. The first request is saved under that key. Any repeat with the same key gets the saved answer back and no new charge. If someone reuses a key with different details, it's rejected. Most payment APIs use the same idea.

**2. Double-entry ledger (money never appears or disappears).** Every payment writes two entries: minus 500 on the card, plus 500 on the merchant. Add up every entry in the system and you must always get zero. A test checks this after 20 payments and a refund. Balances are never stored, they are added up from the entries, so they can't drift out of sync.

**3. Velocity check (simple fraud control).** Stolen cards are often tested with many quick payments. More than 3 payments from one card in 60 seconds gets blocked with a clear message.

**Also:** amounts are whole cents, never decimals, because `0.1 + 0.2` is not exactly `0.3` in floating point and you can't be off by a fraction with money.

## Files

| File | What it does |
|---|---|
| `src/ledger.js` | The double-entry ledger |
| `src/fraud.js` | The velocity check |
| `src/payments.js` | Charges, refunds and idempotency |
| `src/server.js` | The HTTP API |
| `test/payments.test.js` | 9 tests covering all of the above |

## Known limits

- Everything is in memory. A real system would use a database, with the idempotency key and the ledger write in one transaction.
- Two identical requests arriving at the exact same instant on different servers would need a database lock or unique constraint.
- The fraud rule is one simple rule. Real systems combine many signals and machine learning.

## License

MIT
