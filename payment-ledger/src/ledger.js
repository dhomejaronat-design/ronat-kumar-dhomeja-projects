// double-entry ledger: every movement of money is two entries that add up to zero
export class Ledger {
  constructor() {
    this.entries = []
  }

  move(from, to, cents, ref) {
    if (!Number.isInteger(cents) || cents <= 0) throw new Error('amount must be a positive whole number of cents')
    this.entries.push({ account: from, cents: -cents, ref })
    this.entries.push({ account: to, cents, ref })
  }

  balance(account) {
    let sum = 0
    for (const e of this.entries) if (e.account === account) sum += e.cents
    return sum
  }

  // should always be 0, otherwise money was lost or invented somewhere
  total() {
    return this.entries.reduce((s, e) => s + e.cents, 0)
  }
}
