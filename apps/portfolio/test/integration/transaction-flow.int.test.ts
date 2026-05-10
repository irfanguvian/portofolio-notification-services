import 'reflect-metadata'
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  EXCHANGES,
  isRpcEnvelope,
  MESSAGE_PATTERNS,
  ROUTING_KEYS,
  type TransactionRecord,
} from '@acumen/shared'
import { NestFactory } from '@nestjs/core'
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify'
import { PrismaClient } from '@prisma/client'
import amqplib from 'amqplib'
import { Redis } from 'ioredis'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { AppModule } from '../../src/app.module.js'

const TEST_USER_ID = '11111111-1111-1111-1111-111111111111'

async function declareTopologyFromDefinitions(rmqUrl: string): Promise<void> {
  const definitionsPath = resolve(
    dirname(fileURLToPath(import.meta.url)),
    '../../../..',
    'docker/rabbitmq/definitions.json',
  )
  const def = JSON.parse(readFileSync(definitionsPath, 'utf8')) as {
    exchanges: { name: string; type: string; durable?: boolean }[]
    queues: { name: string; durable?: boolean; arguments?: Record<string, unknown> }[]
    bindings: { source: string; destination: string; routing_key: string }[]
  }
  const conn = await amqplib.connect(rmqUrl)
  const ch = await conn.createChannel()
  for (const ex of def.exchanges) {
    await ch.assertExchange(ex.name, ex.type, { durable: ex.durable ?? true })
  }
  await ch.assertExchange('acumen.rpc', 'topic', { durable: true })
  for (const q of def.queues) {
    await ch.assertQueue(q.name, {
      durable: q.durable ?? true,
      arguments: q.arguments ?? {},
    })
  }
  for (const b of def.bindings) {
    await ch.bindQueue(b.destination, b.source, b.routing_key)
  }
  await ch.close()
  await conn.close()
}

type RpcReply<T> = { resolve: (v: T) => void; reject: (e: Error) => void; timer: NodeJS.Timeout }

describe('portfolio transaction flow (integration)', () => {
  let app: NestFastifyApplication
  let prisma: PrismaClient
  let redis: Redis
  let probeConn: amqplib.ChannelModel
  let probeCh: amqplib.Channel
  let rpcConn: amqplib.ChannelModel
  let rpcCh: amqplib.Channel
  let rpcReplyQueue: string
  const pendingRpc = new Map<string, RpcReply<unknown>>()
  const probeQueue = 'test.probe.transaction.created'

  async function rpcRaw(
    routingKey: string,
    payload: unknown,
    timeoutMs = 10_000,
  ): Promise<unknown> {
    const correlationId = randomUUID()
    return new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => {
        pendingRpc.delete(correlationId)
        reject(new Error(`RPC timeout for ${routingKey}`))
      }, timeoutMs)
      pendingRpc.set(correlationId, {
        resolve: resolve as (v: unknown) => void,
        reject,
        timer,
      })
      rpcCh.publish('acumen.rpc', routingKey, Buffer.from(JSON.stringify(payload)), {
        contentType: 'application/json',
        correlationId,
        replyTo: rpcReplyQueue,
      })
    })
  }

  async function rpc<T>(routingKey: string, payload: unknown, timeoutMs = 10_000): Promise<T> {
    const reply = await rpcRaw(routingKey, payload, timeoutMs)
    if (isRpcEnvelope(reply)) {
      if (reply.ok === false) {
        throw new Error(`rpc fail ${routingKey}: ${reply.error?.code ?? 'unknown'}`)
      }
      return reply.data as T
    }
    return reply as T
  }

  beforeAll(async () => {
    const rmqUrl = process.env.RABBITMQ_URL
    if (!rmqUrl) throw new Error('RABBITMQ_URL not set by integration setup')
    await declareTopologyFromDefinitions(rmqUrl)

    app = await NestFactory.create<NestFastifyApplication>(
      AppModule.register(),
      new FastifyAdapter({ logger: false }),
      { logger: ['error', 'warn'] },
    )
    await app.init()
    await app.listen(0, '127.0.0.1')

    prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL_PORTFOLIO } } })
    redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379')

    probeConn = await amqplib.connect(rmqUrl)
    probeCh = await probeConn.createChannel()
    await probeCh.assertQueue(probeQueue, { durable: false, autoDelete: true })
    await probeCh.bindQueue(
      probeQueue,
      EXCHANGES.PORTFOLIO_EVENTS,
      ROUTING_KEYS.TRANSACTION_CREATED,
    )
    await probeCh.purgeQueue(probeQueue)

    rpcConn = await amqplib.connect(rmqUrl)
    rpcCh = await rpcConn.createChannel()
    const replyQ = await rpcCh.assertQueue('', { exclusive: true, autoDelete: true })
    rpcReplyQueue = replyQ.queue
    await rpcCh.consume(
      rpcReplyQueue,
      (msg) => {
        if (!msg) return
        const cid = msg.properties.correlationId
        const pending = cid ? pendingRpc.get(cid) : undefined
        if (!pending) return
        clearTimeout(pending.timer)
        pendingRpc.delete(cid)
        try {
          pending.resolve(JSON.parse(msg.content.toString('utf8')))
        } catch (e) {
          pending.reject(e as Error)
        }
      },
      { noAck: true },
    )

    // small grace so consumers/exchanges are visible
    await new Promise((r) => setTimeout(r, 500))
  }, 180_000)

  afterAll(async () => {
    try {
      await probeCh?.close()
      await probeConn?.close()
    } catch {}
    try {
      await rpcCh?.close()
      await rpcConn?.close()
    } catch {}
    try {
      await redis?.quit()
    } catch {}
    try {
      await prisma?.$disconnect()
    } catch {}
    try {
      await app?.close()
    } catch {}
  })

  it('creates a transaction, persists to DB, and publishes transaction.created event', async () => {
    const consumed: unknown[] = []
    await probeCh.consume(
      probeQueue,
      (msg) => {
        if (!msg) return
        try {
          consumed.push(JSON.parse(msg.content.toString('utf8')))
        } catch {
          consumed.push(msg.content.toString('utf8'))
        }
        probeCh.ack(msg)
      },
      { noAck: false },
    )

    const created = await rpc<TransactionRecord>(
      MESSAGE_PATTERNS.TX_CREATE,
      {
        userId: TEST_USER_ID,
        symbol: 'AAPL',
        type: 'BUY',
        qty: 2,
        price: 150,
      },
      15_000,
    )

    expect(created).toBeDefined()
    expect(created.id).toBeTruthy()
    expect(created.userId).toBe(TEST_USER_ID)
    expect(created.symbol).toBe('AAPL')
    expect(created.type).toBe('BUY')
    expect(Number(created.qty)).toBe(2)
    expect(Number(created.price)).toBe(150)

    const dbRow = await prisma.transaction.findUnique({ where: { id: created.id } })
    expect(dbRow).not.toBeNull()
    expect(dbRow?.symbol).toBe('AAPL')

    // Wait up to 5s for the event to land in our probe queue
    const deadline = Date.now() + 5000
    while (consumed.length === 0 && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 100))
    }
    expect(consumed.length).toBeGreaterThan(0)
    const event = consumed[0] as { transactionId: string; userId: string; symbol: string }
    expect(event.transactionId).toBe(created.id)
    expect(event.userId).toBe(TEST_USER_ID)
    expect(event.symbol).toBe('AAPL')
  }, 60_000)

  it('lists transactions and serves cached results on subsequent calls', async () => {
    // first call populates cache
    const first = await rpc<TransactionRecord[]>(
      MESSAGE_PATTERNS.TX_LIST,
      { userId: TEST_USER_ID },
      10_000,
    )

    expect(Array.isArray(first)).toBe(true)
    expect(first.length).toBeGreaterThan(0)

    const cacheKey = `tx:list:${TEST_USER_ID}`
    const cachedRaw = await redis.get(cacheKey)
    expect(cachedRaw).not.toBeNull()

    // delete the underlying row, list again — cache should still have it
    const target = first[0]
    if (!target) throw new Error('expected at least one tx')

    await prisma.transaction.deleteMany({ where: { id: target.id } })

    const second = await rpc<TransactionRecord[]>(
      MESSAGE_PATTERNS.TX_LIST,
      { userId: TEST_USER_ID },
      10_000,
    )
    expect(second.find((r) => r.id === target.id)).toBeDefined()

    // Bust cache and verify list reflects deletion
    await redis.del(cacheKey)
    const third = await rpc<TransactionRecord[]>(
      MESSAGE_PATTERNS.TX_LIST,
      { userId: TEST_USER_ID },
      10_000,
    )
    expect(third.find((r) => r.id === target.id)).toBeUndefined()
  }, 30_000)

  it('returns RpcEnvelope { ok: false, code: VALIDATION_ERROR } on bad TX_CREATE payload', async () => {
    const reply = (await rpcRaw(
      MESSAGE_PATTERNS.TX_CREATE,
      { userId: TEST_USER_ID, symbol: 'AAPL', type: 'BUY', qty: -1, price: 0 },
      10_000,
    )) as { ok: boolean; error?: { code: string; message: string } }
    expect(reply).toBeDefined()
    expect(reply.ok).toBe(false)
    expect(reply.error?.code).toBe('VALIDATION_ERROR')
  }, 30_000)
})
