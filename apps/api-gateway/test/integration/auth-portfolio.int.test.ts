import { execSync } from 'node:child_process'
import { setTimeout as delay } from 'node:timers/promises'
import { MESSAGE_PATTERNS } from '@acumen/shared'
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql'
import { RabbitMQContainer, type StartedRabbitMQContainer } from '@testcontainers/rabbitmq'
import amqplib, { type ChannelModel, type Channel } from 'amqplib'
import supertest from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const RPC_EXCHANGE = 'acumen.rpc'

let pg: StartedPostgreSqlContainer
let rabbit: StartedRabbitMQContainer
let amqpConn: ChannelModel
let mockChannel: Channel
let app: import('@nestjs/platform-fastify').NestFastifyApplication
let request: ReturnType<typeof supertest>

const recorded: { pattern: string; payload: unknown }[] = []

async function startMockRpcServer(rabbitUri: string) {
  amqpConn = await amqplib.connect(rabbitUri)
  mockChannel = await amqpConn.createChannel()
  await mockChannel.assertExchange(RPC_EXCHANGE, 'topic', { durable: true })
  const q = await mockChannel.assertQueue('test.gateway.rpc.mock', {
    autoDelete: true,
    durable: false,
  })
  for (const pattern of Object.values(MESSAGE_PATTERNS)) {
    await mockChannel.bindQueue(q.queue, RPC_EXCHANGE, pattern)
  }

  await mockChannel.consume(
    q.queue,
    (msg) => {
      if (!msg) return
      const pattern = msg.fields.routingKey
      let payload: unknown = null
      try {
        payload = JSON.parse(msg.content.toString('utf8'))
      } catch {
        payload = msg.content.toString('utf8')
      }
      recorded.push({ pattern, payload })

      const replyTo = msg.properties.replyTo
      const correlationId = msg.properties.correlationId
      if (replyTo && correlationId) {
        const response = buildMockResponse(pattern, payload)
        mockChannel.sendToQueue(replyTo, Buffer.from(JSON.stringify(response)), {
          correlationId,
          contentType: 'application/json',
        })
      }
      mockChannel.ack(msg)
    },
    { noAck: false },
  )
}

type MockResponse =
  | { ok: true; data: unknown }
  | { ok: false; error: { code: string; message: string } }

function buildMockResponse(pattern: string, payload: unknown): MockResponse {
  const p = (payload ?? {}) as Record<string, unknown>
  switch (pattern) {
    case MESSAGE_PATTERNS.TX_CREATE:
      if (p.symbol === 'BADRPC') {
        return {
          ok: false,
          error: { code: 'VALIDATION_ERROR', message: 'mock rpc validation fail' },
        }
      }
      return {
        ok: true,
        data: {
          id: '11111111-1111-1111-1111-111111111111',
          userId: p.userId,
          symbol: p.symbol,
          type: p.type,
          qty: p.qty,
          price: p.price,
          createdAt: new Date().toISOString(),
        },
      }
    case MESSAGE_PATTERNS.TX_LIST:
      return { ok: true, data: [] }
    case MESSAGE_PATTERNS.PREFS_SET:
    case MESSAGE_PATTERNS.PREFS_GET:
      return { ok: true, data: { userId: p.userId, channel: 'EMAIL', enabled: true } }
    case MESSAGE_PATTERNS.RULES_SET:
      return {
        ok: true,
        data: {
          id: '22222222-2222-2222-2222-222222222222',
          userId: p.userId,
          eventType: 'TRADE_EXECUTED',
          enabled: true,
        },
      }
    case MESSAGE_PATTERNS.NOTIFICATIONS_LIST:
      return { ok: true, data: [] }
    case MESSAGE_PATTERNS.HEALTH_PING_PORTFOLIO:
      return { ok: true, data: { service: 'portfolio', ts: Date.now() } }
    case MESSAGE_PATTERNS.HEALTH_PING_NOTIFICATION:
      return { ok: true, data: { service: 'notification', ts: Date.now() } }
    default:
      return { ok: true, data: null }
  }
}

beforeAll(async () => {
  pg = await new PostgreSqlContainer('postgres:16-alpine')
    .withDatabase('acumen_test')
    .withUsername('acumen')
    .withPassword('acumen')
    .start()
  rabbit = await new RabbitMQContainer('rabbitmq:3.13-management-alpine').start()

  const dbUrl = `postgresql://acumen:acumen@${pg.getHost()}:${pg.getMappedPort(5432)}/acumen_test?schema=gateway`
  const rabbitUri = `amqp://${rabbit.getHost()}:${rabbit.getMappedPort(5672)}`

  process.env.NODE_ENV = 'test'
  process.env.LOG_LEVEL = 'silent'
  process.env.DATABASE_URL_GATEWAY = dbUrl
  process.env.RABBITMQ_URL = rabbitUri
  process.env.JWT_SECRET = 'test-secret-must-be-thirty-two-or-more-chars-aaa'
  process.env.JWT_EXPIRES_IN = '1h'
  process.env.GATEWAY_PORT = '0'
  process.env.RPC_TIMEOUT_MS = '8000'
  process.env.CORS_ORIGIN = '*'

  execSync('npx prisma db push --skip-generate', {
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL_GATEWAY: dbUrl },
    cwd: new URL('../../', import.meta.url).pathname,
  })

  await startMockRpcServer(rabbitUri)

  const { bootstrap } = await import('../../src/main.js')
  app = await bootstrap()
  await app.init()
  const server = app.getHttpServer()
  request = supertest(server)
}, 180_000)

afterAll(async () => {
  try {
    await app?.close()
  } catch {}
  try {
    await mockChannel?.close()
  } catch {}
  try {
    await amqpConn?.close()
  } catch {}
  try {
    await rabbit?.stop()
  } catch {}
  try {
    await pg?.stop()
  } catch {}
})

describe('api-gateway integration', () => {
  let token: string
  let userId: string
  const email = `inttest-${Date.now()}@example.com`
  const password = 'Passw0rd!Strong'

  it('rejects unauthenticated transaction creation', async () => {
    const res = await request
      .post('/portfolio/transactions')
      .send({ symbol: 'AAPL', type: 'BUY', qty: 1, price: 100 })
    expect(res.status).toBe(401)
  })

  it('registers a user and returns JWT', async () => {
    const res = await request.post('/auth/register').send({ email, password })
    expect(res.status).toBe(201)
    expect(typeof res.body.token).toBe('string')
    expect(typeof res.body.userId).toBe('string')
    token = res.body.token
    userId = res.body.userId
  })

  it('rejects duplicate registration', async () => {
    const res = await request.post('/auth/register').send({ email, password })
    expect(res.status).toBe(409)
  })

  it('logs in with correct credentials', async () => {
    const res = await request.post('/auth/login').send({ email, password })
    expect(res.status).toBe(200)
    expect(res.body.userId).toBe(userId)
    expect(typeof res.body.token).toBe('string')
    token = res.body.token
  })

  it('rejects login with wrong password', async () => {
    const res = await request.post('/auth/login').send({ email, password: 'wrong-password' })
    expect(res.status).toBe(401)
  })

  it('publishes RPC create with userId on transaction create', async () => {
    recorded.length = 0
    const res = await request
      .post('/portfolio/transactions')
      .set('Authorization', `Bearer ${token}`)
      .send({ symbol: 'AAPL', type: 'BUY', qty: 2, price: 150.25 })
    expect(res.status).toBe(201)
    expect(res.body.userId).toBe(userId)
    expect(res.body.symbol).toBe('AAPL')

    await delay(50)
    const recordedCreate = recorded.find((r) => r.pattern === MESSAGE_PATTERNS.TX_CREATE)
    expect(recordedCreate).toBeDefined()
    expect(recordedCreate?.payload).toMatchObject({
      userId,
      symbol: 'AAPL',
      type: 'BUY',
      qty: 2,
      price: 150.25,
    })
  })

  it('rejects invalid transaction payload via ValidationPipe', async () => {
    const res = await request
      .post('/portfolio/transactions')
      .set('Authorization', `Bearer ${token}`)
      .send({ symbol: 'AAPL', type: 'INVALID', qty: -1, price: 0 })
    expect(res.status).toBe(400)
  })

  it('maps RPC validation fail envelope to 400 with code=VALIDATION_ERROR', async () => {
    const res = await request
      .post('/portfolio/transactions')
      .set('Authorization', `Bearer ${token}`)
      .send({ symbol: 'BADRPC', type: 'BUY', qty: 1, price: 100 })
    expect(res.status).toBe(400)
    expect(res.body.code).toBe('VALIDATION_ERROR')
    expect(typeof res.body.message).toBe('string')
  })

  it('proxies preferences set + get with userId injected', async () => {
    recorded.length = 0
    const setRes = await request
      .post('/preferences')
      .set('Authorization', `Bearer ${token}`)
      .send({ channel: 'EMAIL', enabled: true })
    expect(setRes.status).toBe(200)

    const getRes = await request.get('/preferences').set('Authorization', `Bearer ${token}`)
    expect(getRes.status).toBe(200)

    const setMsg = recorded.find((r) => r.pattern === MESSAGE_PATTERNS.PREFS_SET)
    expect(setMsg?.payload).toMatchObject({ userId, channel: 'EMAIL', enabled: true })
    const getMsg = recorded.find((r) => r.pattern === MESSAGE_PATTERNS.PREFS_GET)
    expect(getMsg?.payload).toMatchObject({ userId })
  })

  it('proxies rules set with userId injected', async () => {
    recorded.length = 0
    const res = await request
      .post('/rules')
      .set('Authorization', `Bearer ${token}`)
      .send({ eventType: 'TRADE_EXECUTED', enabled: true })
    expect(res.status).toBe(200)
    const msg = recorded.find((r) => r.pattern === MESSAGE_PATTERNS.RULES_SET)
    expect(msg?.payload).toMatchObject({ userId, eventType: 'TRADE_EXECUTED', enabled: true })
  })

  it('proxies notifications list', async () => {
    recorded.length = 0
    const res = await request.get('/notifications').set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
    const msg = recorded.find((r) => r.pattern === MESSAGE_PATTERNS.NOTIFICATIONS_LIST)
    expect(msg?.payload).toMatchObject({ userId })
  })

  it('exposes /healthz with downstream rpc readiness', async () => {
    const res = await request.get('/healthz')
    expect(res.status).toBe(200)
    expect(res.body.checks.db).toBe('up')
    expect(res.body.checks.rmq).toBe('up')
    expect(res.body.checks.portfolio_rpc).toBe('up')
    expect(res.body.checks.notification_rpc).toBe('up')
    expect(res.body.status).toBe('ok')
  })

  it('reports rpc_timeout in details when downstream health.ping is unbound', async () => {
    const queueName = 'test.gateway.rpc.mock'
    await mockChannel.unbindQueue(queueName, RPC_EXCHANGE, MESSAGE_PATTERNS.HEALTH_PING_PORTFOLIO)
    await mockChannel.unbindQueue(
      queueName,
      RPC_EXCHANGE,
      MESSAGE_PATTERNS.HEALTH_PING_NOTIFICATION,
    )
    try {
      const res = await request.get('/healthz')
      expect(res.status).toBe(200)
      expect(res.body.checks.db).toBe('up')
      expect(res.body.checks.rmq).toBe('up')
      expect(res.body.checks.portfolio_rpc).toBe('down')
      expect(res.body.checks.notification_rpc).toBe('down')
      expect(res.body.status).toBe('degraded')
      expect(res.body.details).toBeDefined()
      expect(res.body.details.portfolio_rpc).toMatch(/timeout/i)
      expect(res.body.details.notification_rpc).toMatch(/timeout/i)
    } finally {
      await mockChannel.bindQueue(queueName, RPC_EXCHANGE, MESSAGE_PATTERNS.HEALTH_PING_PORTFOLIO)
      await mockChannel.bindQueue(
        queueName,
        RPC_EXCHANGE,
        MESSAGE_PATTERNS.HEALTH_PING_NOTIFICATION,
      )
    }
  }, 12_000)
})
