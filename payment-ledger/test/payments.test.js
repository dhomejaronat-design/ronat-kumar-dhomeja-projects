import test from 'node:test'
import assert from 'node:assert/strict'
import { Payments } from '../src/payments.js'
import { Ledger } from '../src/ledger.js'
import { VelocityCheck } from '../src/fraud.js'
import { makeServer } from '../src/server.js'

const pay = { card: 'c1', merchant: 'm1', cents: 500 }

test('a charge moves money from card to merchant', () => {
  const p = new Payments()
  const r = p.charge(pay, 'k1')
  assert.equal(r.status, 201)
  assert.equal(p.ledger.balance('merchant:m1'), 500)
  assert.equal(p.ledger.balance('card:c1'), -500)
})

test('same idempotency key never charges twice', () => {
  const p = new Payments()
  const a = p.charge(pay, 'k1')
  const b = p.charge(pay, 'k1')
  assert.deepEqual(a, b)
  assert.equal(p.ledger.balance('merchant:m1'), 500)
})

test('reusing a key with different details is rejected', () => {
  const p = new Payments()
  p.charge(pay, 'k1')
  assert.equal(p.charge({ ...pay, cents: 900 }, 'k1').status, 422)
})

test('missing key or bad amount is rejected', () => {
  const p = new Payments()
  assert.equal(p.charge(pay).status, 400)
  assert.equal(p.charge({ ...pay, cents: 4.5 }, 'k2').status, 400)
  assert.equal(p.charge({ ...pay, cents: -1 }, 'k3').status, 400)
})

test('ledger always sums to zero', () => {
  const p = new Payments({ fraud: new VelocityCheck(100) })
  for (let i = 0; i < 20; i++) p.charge({ card: `c${i % 3}`, merchant: 'm1', cents: 100 + i }, `k${i}`)
  const id = p.charge(pay, 'last').body.id
  p.refund(id, 200)
  assert.equal(p.ledger.total(), 0)
})

test('partial and full refunds, never more than was paid', () => {
  const p = new Payments()
  const id = p.charge(pay, 'k1').body.id
  assert.equal(p.refund(id, 200).body.refunded, 200)
  assert.equal(p.refund(id, 400).status, 400)
  assert.equal(p.refund(id).body.refunded, 500)
  assert.equal(p.ledger.balance('merchant:m1'), 0)
  assert.equal(p.refund('nope').status, 404)
})

test('velocity check blocks the 4th payment in a minute, then lets it through later', () => {
  const p = new Payments()
  const t = 1_000_000
  for (let i = 0; i < 3; i++) assert.equal(p.charge(pay, `k${i}`, t + i).status, 201)
  assert.equal(p.charge(pay, 'k3', t + 10).status, 402)
  assert.equal(p.charge(pay, 'k4', t + 61_000).status, 201)
})

test('ledger refuses bad amounts', () => {
  assert.throws(() => new Ledger().move('a', 'b', 0))
})

test('http api end to end', async () => {
  const srv = makeServer().listen(0)
  const base = `http://localhost:${srv.address().port}`
  const post = (path, body, key) => fetch(base + path, {
    method: 'POST', body: JSON.stringify(body),
    headers: key ? { 'idempotency-key': key } : {},
  })

  const r = await post('/payments', pay, 'k1')
  assert.equal(r.status, 201)
  const { id } = await r.json()

  assert.equal((await post('/payments', pay, 'k1')).status, 201)
  assert.equal((await post(`/payments/${id}/refund`, { cents: 100 })).status, 200)
  const bal = await (await fetch(base + '/balances/merchant:m1')).json()
  assert.equal(bal.cents, 400)

  assert.equal((await fetch(base + '/nope')).status, 404)
  assert.equal((await fetch(base + '/payments', { method: 'POST', body: '{bad' })).status, 400)
  srv.close()
})
