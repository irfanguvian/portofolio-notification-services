#!/usr/bin/env node
// Per-user, sequential, black-box API simulation against the Acumen gateway.
// Hits every public endpoint of every app via fetch, threading the JWT
// captured at login through every authenticated step. Includes negative
// paths (401 unauth, 400 invalid body) so the journey doubles as a smoke
// test for input validation + auth gates.

import { setTimeout as sleep } from 'node:timers/promises'

let pc
try {
  pc = await import('picocolors').then((m) => m.default ?? m)
} catch {
  const id = (s) => s
  pc = { green: id, red: id, yellow: id, cyan: id, dim: id, bold: id, magenta: id }
}

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:3000'
const HEALTH_RETRIES = 30
const HEALTH_INTERVAL_MS = 500

const SEED_USERS = [
  { email: 'alice@seed.local', password: 'Passw0rd!' },
  { email: 'bob@seed.local', password: 'Passw0rd!' },
  { email: 'carol@seed.local', password: 'Passw0rd!' },
]

const SEED_SYMBOLS = ['AAPL', 'MSFT', 'NVDA', 'AMZN', 'TSLA']

function randomSymbol() {
  return SEED_SYMBOLS[Math.floor(Math.random() * SEED_SYMBOLS.length)]
}
function randomQty() {
  return Number((Math.random() * 9 + 1).toFixed(4))
}
function randomPrice() {
  return Number((Math.random() * 500 + 10).toFixed(2))
}
function randomType() {
  return Math.random() < 0.5 ? 'BUY' : 'SELL'
}

const STEPS = [
  {
    id: '01',
    name: 'gateway healthz',
    method: 'GET',
    path: '/healthz',
    auth: false,
    expect: 200,
    assert: (json) => json && (json.status === 'ok' || json.status === 'degraded'),
  },
  {
    id: '02',
    name: 'register (idempotent)',
    method: 'POST',
    path: '/auth/register',
    auth: false,
    expect: [200, 201, 409],
    body: ({ user }) => ({ email: user.email, password: user.password }),
  },
  {
    id: '03',
    name: 'login',
    method: 'POST',
    path: '/auth/login',
    auth: false,
    expect: 200,
    body: ({ user }) => ({ email: user.email, password: user.password }),
    capture: (json, ctx) => {
      ctx.token = json.token
      ctx.userId = json.userId
    },
    assert: (json) => typeof json?.token === 'string' && json.token.length > 0,
  },
  {
    id: '04',
    name: 'unauth tx (negative → 401)',
    method: 'POST',
    path: '/portfolio/transactions',
    auth: false,
    expect: 401,
    body: () => ({ symbol: 'AAPL', type: 'BUY', qty: 1, price: 1 }),
  },
  {
    id: '05',
    name: 'invalid prefs (negative → 400)',
    method: 'POST',
    path: '/preferences',
    auth: true,
    expect: 400,
    body: () => ({ channel: 'NOPE', enabled: 'maybe' }),
  },
  {
    id: '06',
    name: 'set preferences',
    method: 'POST',
    path: '/preferences',
    auth: true,
    expect: 200,
    body: () => ({ channel: 'EMAIL', enabled: true }),
  },
  {
    id: '07',
    name: 'get preferences',
    method: 'GET',
    path: '/preferences',
    auth: true,
    expect: 200,
    assert: (json) => json?.channel === 'EMAIL' && json?.enabled === true,
  },
  {
    id: '08',
    name: 'set rule',
    method: 'POST',
    path: '/rules',
    auth: true,
    expect: 200,
    body: () => ({ eventType: 'TRADE_EXECUTED', enabled: true }),
  },
  {
    id: '09',
    name: 'create transaction #1',
    method: 'POST',
    path: '/portfolio/transactions',
    auth: true,
    expect: 201,
    body: () => ({
      symbol: randomSymbol(),
      type: randomType(),
      qty: randomQty(),
      price: randomPrice(),
    }),
    capture: (json, ctx) => {
      ctx.lastTxId = json.id
    },
  },
  {
    id: '10',
    name: 'create transaction #2',
    method: 'POST',
    path: '/portfolio/transactions',
    auth: true,
    expect: 201,
    body: () => ({
      symbol: randomSymbol(),
      type: randomType(),
      qty: randomQty(),
      price: randomPrice(),
    }),
  },
  {
    id: '11',
    name: 'create transaction #3',
    method: 'POST',
    path: '/portfolio/transactions',
    auth: true,
    expect: 201,
    body: () => ({
      symbol: randomSymbol(),
      type: randomType(),
      qty: randomQty(),
      price: randomPrice(),
    }),
  },
  {
    id: '12',
    name: 'list transactions',
    method: 'GET',
    path: '/portfolio/transactions',
    auth: true,
    expect: 200,
    assert: (json, ctx) =>
      Array.isArray(json) &&
      json.length >= 3 &&
      (!ctx.lastTxId || json.some((t) => t.id === ctx.lastTxId)),
  },
  {
    id: '13',
    name: 'list notifications (poll)',
    method: 'GET',
    path: '/notifications',
    auth: true,
    expect: 200,
    poll: {
      tries: 10,
      intervalMs: 500,
      until: (json) =>
        Array.isArray(json) &&
        json.some((n) => n?.eventType === 'TRADE_EXECUTED' && n?.status === 'SENT'),
    },
    capture: (json, ctx) => {
      const sent = Array.isArray(json)
        ? json.find((n) => n?.eventType === 'TRADE_EXECUTED' && n?.status === 'SENT')
        : null
      if (sent) ctx.notificationId = sent.id
    },
  },
]

async function waitForGatewayHealthy() {
  for (let i = 0; i < HEALTH_RETRIES; i++) {
    try {
      const res = await fetch(`${BASE_URL}/healthz`)
      if (res.ok) {
        const body = await res.json().catch(() => null)
        if (body?.status === 'ok') {
          console.log(pc.green(`[gateway healthy] ${BASE_URL} (after ${i + 1} probe(s))`))
          return
        }
      }
    } catch {
      // gateway not up
    }
    await sleep(HEALTH_INTERVAL_MS)
  }
  throw new Error(`gateway never reported status:'ok' at ${BASE_URL}/healthz`)
}

async function callOnce(step, ctx, user) {
  const headers = { 'content-type': 'application/json' }
  if (step.auth) {
    if (!ctx.token) throw new Error(`step ${step.id} requires auth but no token captured yet`)
    headers.authorization = `Bearer ${ctx.token}`
  }
  const body = step.body ? step.body({ user, ctx }) : undefined
  const init = {
    method: step.method,
    headers,
    body: body == null ? undefined : JSON.stringify(body),
  }
  const t0 = Date.now()
  const res = await fetch(`${BASE_URL}${step.path}`, init)
  const ms = Date.now() - t0
  const text = await res.text()
  let json
  if (text.length > 0) {
    try {
      json = JSON.parse(text)
    } catch {
      json = text
    }
  }
  return { status: res.status, json, ms }
}

function statusMatches(actual, expect) {
  if (Array.isArray(expect)) return expect.includes(actual)
  return actual === expect
}

async function runStep(step, user, ctx) {
  let last
  if (step.poll) {
    const { tries, intervalMs, until } = step.poll
    for (let attempt = 1; attempt <= tries; attempt++) {
      last = await callOnce(step, ctx, user)
      if (statusMatches(last.status, step.expect) && until(last.json, ctx)) {
        const tag = pc.green('OK')
        console.log(
          `STEP ${step.id} [user=${user.email}] ${step.method} ${step.path} → ${last.status} (${last.ms}ms) attempt=${attempt} ${tag} ${pc.dim(step.name)}`,
        )
        if (step.capture) step.capture(last.json, ctx)
        return { ok: true, ms: last.ms }
      }
      if (attempt < tries) await sleep(intervalMs)
    }
    const tag = pc.red('FAIL')
    console.log(
      `STEP ${step.id} [user=${user.email}] ${step.method} ${step.path} → ${last?.status ?? 'no-response'} ${tag} ${pc.dim(`poll exhausted: ${step.name}`)}`,
    )
    if (last?.json !== undefined) {
      console.log(pc.red(`  body: ${JSON.stringify(last.json).slice(0, 400)}`))
    }
    return { ok: false, ms: last?.ms ?? 0, error: 'poll exhausted' }
  }

  last = await callOnce(step, ctx, user)
  const statusOk = statusMatches(last.status, step.expect)
  const assertOk = step.assert ? step.assert(last.json, ctx) : true
  if (statusOk && assertOk) {
    const tag = pc.green('OK')
    console.log(
      `STEP ${step.id} [user=${user.email}] ${step.method} ${step.path} → ${last.status} (${last.ms}ms) ${tag} ${pc.dim(step.name)}`,
    )
    if (step.capture) step.capture(last.json, ctx)
    return { ok: true, ms: last.ms }
  }
  const tag = pc.red('FAIL')
  const reason = !statusOk
    ? `expected ${JSON.stringify(step.expect)}, got ${last.status}`
    : 'assertion failed'
  console.log(
    `STEP ${step.id} [user=${user.email}] ${step.method} ${step.path} → ${last.status} (${last.ms}ms) ${tag} ${pc.dim(reason)}`,
  )
  if (last.json !== undefined) {
    console.log(pc.red(`  body: ${JSON.stringify(last.json).slice(0, 400)}`))
  }
  return { ok: false, ms: last.ms, error: reason }
}

async function runUser(user) {
  console.log(pc.bold(`\n=== user=${user.email} ===`))
  const ctx = { token: null, userId: null, lastTxId: null, notificationId: null }
  const results = []
  for (const step of STEPS) {
    const r = await runStep(step, user, ctx)
    results.push({ stepId: step.id, name: step.name, ok: r.ok, ms: r.ms, error: r.error })
    if (!r.ok) return { user: user.email, ctx, results, pass: false }
  }
  return { user: user.email, ctx, results, pass: true }
}

async function main() {
  console.log(pc.bold(`Acumen user-journey :: ${BASE_URL}`))
  await waitForGatewayHealthy()
  const summary = []
  for (const user of SEED_USERS) {
    summary.push(await runUser(user))
  }

  console.log('')
  console.log(pc.bold('=== summary ==='))
  for (const s of summary) {
    const tag = s.pass ? pc.green('PASS') : pc.red('FAIL')
    const failedSteps = s.results.filter((r) => !r.ok)
    console.log(
      `${tag} ${s.user} — ${s.results.length} steps${failedSteps.length ? `, failed at ${failedSteps[0].stepId} (${failedSteps[0].name}): ${failedSteps[0].error}` : ''}`,
    )
  }
  const allPassed = summary.every((s) => s.pass)
  console.log('')
  console.log(`${summary.filter((s) => s.pass).length}/${summary.length} users passed`)
  process.exit(allPassed ? 0 : 1)
}

main().catch((err) => {
  console.error(pc.red(`[journey] FATAL: ${err.message}`))
  if (err.stack) console.error(pc.dim(err.stack))
  process.exit(1)
})
