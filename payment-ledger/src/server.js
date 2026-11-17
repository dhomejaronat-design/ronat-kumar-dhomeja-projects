import http from 'node:http'
import { Payments } from './payments.js'

export function makeServer(pay = new Payments()) {
  return http.createServer(async (req, res) => {
    const send = ({ status, body }) => {
      res.writeHead(status, { 'content-type': 'application/json' })
      res.end(JSON.stringify(body))
    }

    let data = {}
    if (req.method === 'POST') {
      let raw = ''
      for await (const chunk of req) raw += chunk
      try { data = raw ? JSON.parse(raw) : {} }
      catch { return send({ status: 400, body: { error: 'body must be JSON' } }) }
    }

    const url = new URL(req.url, 'http://x')
    const parts = url.pathname.split('/').filter(Boolean)

    if (req.method === 'POST' && url.pathname === '/payments') {
      return send(pay.charge(data, req.headers['idempotency-key']))
    }
    if (req.method === 'POST' && parts[0] === 'payments' && parts[2] === 'refund') {
      return send(pay.refund(parts[1], data.cents))
    }
    if (req.method === 'GET' && parts[0] === 'balances' && parts[1]) {
      return send({ status: 200, body: { account: parts[1], cents: pay.ledger.balance(parts[1]) } })
    }
    send({ status: 404, body: { error: 'not found' } })
  })
}

if (import.meta.url === `file://${process.argv[1]}`) {
  makeServer().listen(3000, () => console.log('listening on http://localhost:3000'))
}
