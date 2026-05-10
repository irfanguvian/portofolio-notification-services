import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'
import * as amqp from 'amqplib'
import { GenericContainer, type StartedTestContainer } from 'testcontainers'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PrismaClient } from '../../prisma/client/index.js'

const REDIS_TEST_URL = 'redis://localhost:6380'

let pgContainer: StartedTestContainer
let rmqContainer: StartedTestContainer
let pgUrl: string
let amqpUrl: string
let prisma: PrismaClient
let appProcess: ReturnType<typeof import('node:child_process').spawn> | undefined

function loadDefinitions(): Record<string, unknown> {
  const path = resolve(__dirname, '../../../../docker/rabbitmq/definitions.json')
  return JSON.parse(readFileSync(path, 'utf8'))
}

interface RmqDef {
  exchanges: Array<{ name: string; type: string; durable?: boolean }>
  queues: Array<{ name: string; durable?: boolean; arguments?: Record<string, unknown> }>
  bindings: Array<{
    source: string
    destination: string
    destination_type: string
    routing_key: string
  }>
}

async function applyTopology(url: string): Promise<void> {
  const def = loadDefinitions() as unknown as RmqDef
  const conn = await amqp.connect(url)
  const ch = await conn.createChannel()
  for (const ex of def.exchanges) {
    await ch.assertExchange(ex.name, ex.type, { durable: ex.durable !== false })
  }
  // The acumen.rpc topic exchange used for cross-service RPC
  await ch.assertExchange('acumen.rpc', 'topic', { durable: true })
  for (const q of def.queues) {
    await ch.assertQueue(q.name, {
      durable: q.durable !== false,
      arguments: q.arguments,
    })
  }
  for (const b of def.bindings) {
    if (b.destination_type === 'queue') {
      await ch.bindQueue(b.destination, b.source, b.routing_key)
    }
  }
  await ch.close()
  await conn.close()
}

async function startMockPortfolioRpcServer(url: string): Promise<{
  close: () => Promise<void>
  prefsCalls: number
  rulesCalls: number
}> {
  const conn = await amqp.connect(url)
  const ch = await conn.createChannel()
  await ch.assertExchange('acumen.rpc', 'topic', { durable: true })

  // Use auto-delete + non-exclusive anonymous queues so each test instance is independent.
  const prefsQueue = await ch.assertQueue('', { exclusive: false, autoDelete: true })
  const rulesQueue = await ch.assertQueue('', { exclusive: false, autoDelete: true })
  await ch.bindQueue(prefsQueue.queue, 'acumen.rpc', 'portfolio.prefs.get')
  await ch.bindQueue(rulesQueue.queue, 'acumen.rpc', 'portfolio.rules.get')

  const state = { prefsCalls: 0, rulesCalls: 0 }

  await ch.consume(prefsQueue.queue, (msg) => {
    if (!msg) return
    state.prefsCalls += 1
    const body = JSON.parse(msg.content.toString('utf8'))
    const reply = {
      userId: body.userId,
      channel: 'EMAIL',
      enabled: true,
    }
    if (msg.properties.replyTo) {
      ch.sendToQueue(msg.properties.replyTo, Buffer.from(JSON.stringify(reply)), {
        correlationId: msg.properties.correlationId,
        contentType: 'application/json',
      })
    }
    ch.ack(msg)
  })

  await ch.consume(rulesQueue.queue, (msg) => {
    if (!msg) return
    state.rulesCalls += 1
    const body = JSON.parse(msg.content.toString('utf8'))
    const reply = {
      id: '00000000-0000-0000-0000-000000000aaa',
      userId: body.userId,
      eventType: 'TRADE_EXECUTED',
      enabled: true,
    }
    if (msg.properties.replyTo) {
      ch.sendToQueue(msg.properties.replyTo, Buffer.from(JSON.stringify(reply)), {
        correlationId: msg.properties.correlationId,
        contentType: 'application/json',
      })
    }
    ch.ack(msg)
  })

  return {
    close: async () => {
      await ch.close()
      await conn.close()
    },
    get prefsCalls() {
      return state.prefsCalls
    },
    get rulesCalls() {
      return state.rulesCalls
    },
  }
}

async function publishTransactionCreated(
  url: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const conn = await amqp.connect(url)
  const ch = await conn.createChannel()
  await ch.assertExchange('portfolio.events', 'topic', { durable: true })
  ch.publish('portfolio.events', 'transaction.created', Buffer.from(JSON.stringify(payload)), {
    contentType: 'application/json',
    persistent: true,
  })
  await ch.close()
  await conn.close()
}

async function startNotificationApp(env: NodeJS.ProcessEnv): Promise<{
  stop: () => Promise<void>
  logs: string[]
}> {
  const { spawn } = await import('node:child_process')
  const logs: string[] = []
  const proc = spawn('node', ['dist/main.js'], {
    cwd: resolve(__dirname, '../..'),
    env: { ...process.env, ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  appProcess = proc
  proc.stdout?.on('data', (d) => {
    const s = d.toString()
    logs.push(s)
  })
  proc.stderr?.on('data', (d) => {
    const s = d.toString()
    logs.push(s)
  })

  const ready = await waitForLog(logs, 'FEATURE_NOTIFICATION_READY', 30_000)
  if (!ready) throw new Error(`notification app failed to boot. logs:\n${logs.join('\n')}`)

  return {
    stop: async () => {
      proc.kill('SIGTERM')
      await new Promise((res) => proc.on('exit', () => res(null)))
    },
    logs,
  }
}

async function waitForLog(logs: string[], needle: string, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (logs.some((l) => l.includes(needle))) return true
    await sleep(200)
  }
  return false
}

beforeAll(async () => {
  pgContainer = await new GenericContainer('postgres:16-alpine')
    .withEnvironment({ POSTGRES_USER: 'test', POSTGRES_PASSWORD: 'test', POSTGRES_DB: 'test' })
    .withExposedPorts(5432)
    .withCommand(['postgres', '-c', 'fsync=off'])
    .withStartupTimeout(120_000)
    .start()

  const pgPort = pgContainer.getMappedPort(5432)
  pgUrl = `postgresql://test:test@localhost:${pgPort}/test?schema=notification`
  // Create schema first
  execSync(
    `docker exec ${pgContainer.getId()} psql -U test -d test -c "CREATE SCHEMA IF NOT EXISTS notification;"`,
    { stdio: 'inherit' },
  )

  rmqContainer = await new GenericContainer('rabbitmq:3.13-management-alpine')
    .withEnvironment({ RABBITMQ_DEFAULT_USER: 'test', RABBITMQ_DEFAULT_PASS: 'test' })
    .withExposedPorts(5672)
    .withStartupTimeout(120_000)
    .start()

  const rmqPort = rmqContainer.getMappedPort(5672)
  amqpUrl = `amqp://test:test@localhost:${rmqPort}`

  // Apply topology
  await applyTopology(amqpUrl)

  // Migrate
  execSync('pnpm exec prisma migrate deploy', {
    cwd: resolve(__dirname, '../..'),
    env: { ...process.env, DATABASE_URL_NOTIFICATION: pgUrl },
    stdio: 'inherit',
  })

  prisma = new PrismaClient({ datasources: { db: { url: pgUrl } } })
  await prisma.$connect()
}, 240_000)

afterAll(async () => {
  if (appProcess && !appProcess.killed) {
    appProcess.kill('SIGTERM')
  }
  await prisma?.$disconnect()
  await pgContainer?.stop()
  await rmqContainer?.stop()
}, 60_000)

describe('notification consumer integration', () => {
  it('happy path: creates a notification with status=SENT', async () => {
    const mock = await startMockPortfolioRpcServer(amqpUrl)
    const app = await startNotificationApp({
      DATABASE_URL_NOTIFICATION: pgUrl,
      RABBITMQ_URL: amqpUrl,
      REDIS_URL: REDIS_TEST_URL,
      NOTIFICATION_HEALTH_PORT: '13002',
      LOG_LEVEL: 'info',
    })

    const userId = '00000000-0000-0000-0000-000000000001'
    const transactionId = '00000000-0000-0000-0000-0000000000a1'
    await publishTransactionCreated(amqpUrl, {
      transactionId,
      userId,
      symbol: 'AAPL',
      type: 'BUY',
      qty: 1,
      price: 100,
      occurredAt: new Date().toISOString(),
    })

    let row: { status: string; attempts: number } | null = null
    for (let i = 0; i < 30; i++) {
      const found = await prisma.notification.findFirst({
        where: { userId, status: 'SENT' },
        orderBy: { createdAt: 'desc' },
      })
      if (found) {
        row = { status: found.status, attempts: found.attempts }
        break
      }
      await sleep(500)
    }

    await app.stop()
    await mock.close()

    expect(row).not.toBeNull()
    expect(row?.status).toBe('SENT')
  }, 90_000)

  it('retry path: NOTIFICATION_FORCE_FAIL_ONCE redelivers via DLX retry', async () => {
    // Clean prior rows + the per-user redis counter so the once-fail re-arms across reruns
    await prisma.notification.deleteMany({})
    const { Redis } = await import('ioredis')
    const r = new Redis(REDIS_TEST_URL, { lazyConnect: false, maxRetriesPerRequest: 1 })
    await r.del('notif:force-fail:00000000-0000-0000-0000-000000000002')
    r.disconnect()
    const mock = await startMockPortfolioRpcServer(amqpUrl)
    const app = await startNotificationApp({
      DATABASE_URL_NOTIFICATION: pgUrl,
      RABBITMQ_URL: amqpUrl,
      REDIS_URL: REDIS_TEST_URL,
      NOTIFICATION_HEALTH_PORT: '13003',
      NOTIFICATION_FORCE_FAIL_ONCE: 'true',
      LOG_LEVEL: 'info',
    })

    const userId = '00000000-0000-0000-0000-000000000002'
    const transactionId = '00000000-0000-0000-0000-0000000000b1'
    await publishTransactionCreated(amqpUrl, {
      transactionId,
      userId,
      symbol: 'MSFT',
      type: 'BUY',
      qty: 2,
      price: 200,
      occurredAt: new Date().toISOString(),
    })

    let sent: { attempts: number } | null = null
    for (let i = 0; i < 40; i++) {
      const found = await prisma.notification.findFirst({
        where: { userId, status: 'SENT' },
        orderBy: { createdAt: 'desc' },
      })
      if (found) {
        sent = { attempts: found.attempts }
        break
      }
      await sleep(500)
    }

    const allRows = await prisma.notification.findMany({ where: { userId } })

    await app.stop()
    await mock.close()

    expect(sent).not.toBeNull()
    // At least one FAILED row from first attempt + one SENT from retry
    expect(allRows.length).toBeGreaterThanOrEqual(2)
    const hadFailed = allRows.some((n) => n.status === 'FAILED')
    expect(hadFailed).toBe(true)
  }, 120_000)

  it('PII redaction: no email/token/password in app logs', async () => {
    await prisma.notification.deleteMany({})
    const mock = await startMockPortfolioRpcServer(amqpUrl)
    const app = await startNotificationApp({
      DATABASE_URL_NOTIFICATION: pgUrl,
      RABBITMQ_URL: amqpUrl,
      REDIS_URL: REDIS_TEST_URL,
      NOTIFICATION_HEALTH_PORT: '13004',
      LOG_LEVEL: 'info',
    })

    const userId = '00000000-0000-0000-0000-000000000003'
    await publishTransactionCreated(amqpUrl, {
      transactionId: '00000000-0000-0000-0000-0000000000c1',
      userId,
      symbol: 'NVDA',
      type: 'SELL',
      qty: 3,
      price: 300,
      occurredAt: new Date().toISOString(),
      // intentionally include a PII-shaped field to ensure redaction in logs
      email: 'leak@example.com',
      password: 'super-secret',
      token: 'abcd-token',
    } as Record<string, unknown>)

    // give the app time to log
    await sleep(3000)

    const joined = app.logs.join('\n')

    await app.stop()
    await mock.close()

    expect(joined).not.toMatch(/leak@example\.com/)
    expect(joined).not.toMatch(/super-secret/)
    expect(joined).not.toMatch(/abcd-token/)
  }, 60_000)
})
