import { randomUUID } from 'node:crypto'
import { Ledger } from './ledger.js'
import { VelocityCheck } from './fraud.js'

export class Payments {
  constructor({ ledger = new Ledger(), fraud = new VelocityCheck() } = {}) {
    this.ledger = ledger
    this.fraud = fraud
    this.byId = new Map()
    this.byKey = new Map()   // idempotency key -> saved result
  }

  charge({ card, merchant, cents }, key, now) {
    if (!key) return { status: 400, body: { error: 'Idempotency-Key header is required' } }

    // same key again: hand back the first answer, never charge twice
    const old = this.byKey.get(key)
    if (old) {
      if (old.fingerprint !== `${card}|${merchant}|${cents}`) {
        return { status: 422, body: { error: 'this key was already used with different details' } }
      }
      return old.result
    }

    let result
    if (!card || !merchant || !Number.isInteger(cents) || cents <= 0) {
      result = { status: 400, body: { error: 'card, merchant and a positive whole number of cents are required' } }
    } else if (!this.fraud.allow(card, now)) {
      result = { status: 402, body: { error: 'blocked: too many payments from this card' } }
    } else {
      const p = { id: randomUUID(), card, merchant, cents, refunded: 0 }
      this.ledger.move(`card:${card}`, `merchant:${merchant}`, cents, p.id)
      this.byId.set(p.id, p)
      result = { status: 201, body: { ...p } }
    }

    this.byKey.set(key, { fingerprint: `${card}|${merchant}|${cents}`, result })
    return result
  }

  refund(id, cents) {
    const p = this.byId.get(id)
    if (!p) return { status: 404, body: { error: 'payment not found' } }
    cents = cents ?? p.cents - p.refunded
    if (!Number.isInteger(cents) || cents <= 0 || p.refunded + cents > p.cents) {
      return { status: 400, body: { error: 'refund is more than what is left on this payment' } }
    }
    this.ledger.move(`merchant:${p.merchant}`, `card:${p.card}`, cents, p.id)
    p.refunded += cents
    return { status: 200, body: { ...p } }
  }
}
