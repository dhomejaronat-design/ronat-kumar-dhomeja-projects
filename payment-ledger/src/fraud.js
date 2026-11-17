// velocity check: too many payments from one card in a short window gets blocked
export class VelocityCheck {
  constructor(max = 3, windowMs = 60_000) {
    this.max = max
    this.windowMs = windowMs
    this.seen = new Map()
  }

  allow(card, now = Date.now()) {
    const recent = (this.seen.get(card) || []).filter(t => now - t < this.windowMs)
    if (recent.length >= this.max) {
      this.seen.set(card, recent)
      return false
    }
    recent.push(now)
    this.seen.set(card, recent)
    return true
  }
}
