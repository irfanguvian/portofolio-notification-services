import { MESSAGE_PATTERNS, type RpcEnvelope, isRpcEnvelope } from '@acumen/shared'
import { AmqpConnection } from '@golevelup/nestjs-rabbitmq'
import { Controller, Get, Logger } from '@nestjs/common'
import { PrismaService } from '../auth/prisma.service.js'
import { RPC_EXCHANGE } from '../common/rmq/rmq.module.js'

const PING_TIMEOUT_MS = 1500
const RMQ_PROBE_TIMEOUT_MS = 1500

type CheckStatus = 'up' | 'down'
type RpcField = 'portfolio_rpc' | 'notification_rpc'

const RPC_DOWN_EVENT: Record<RpcField, string> = {
  portfolio_rpc: 'ERROR_GATEWAY_HEALTHZ_PORTFOLIO_RPC_DOWN',
  notification_rpc: 'ERROR_GATEWAY_HEALTHZ_NOTIFICATION_RPC_DOWN',
}

interface HealthCheck {
  db: CheckStatus
  rmq: CheckStatus
  portfolio_rpc: CheckStatus
  notification_rpc: CheckStatus
}

interface HealthDetails {
  db?: string
  rmq?: string
  portfolio_rpc?: string
  notification_rpc?: string
}

interface HealthResponse {
  status: 'ok' | 'degraded'
  checks: HealthCheck
  details?: HealthDetails
  timestamp: string
}

interface ChannelLike {
  assertExchange: (name: string, type: string, opts: { durable: boolean }) => Promise<unknown>
}

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race<T>([
    p,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms),
    ),
  ])
}

@Controller('healthz')
export class HealthController {
  private readonly logger = new Logger(HealthController.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly amqp: AmqpConnection,
  ) {}

  @Get()
  async check(): Promise<HealthResponse> {
    const checks: HealthCheck = {
      db: 'down',
      rmq: 'down',
      portfolio_rpc: 'down',
      notification_rpc: 'down',
    }
    const details: HealthDetails = {}

    const dbResult = await this.checkDb()
    checks.db = dbResult.status
    if (dbResult.reason) details.db = dbResult.reason

    const rmqResult = await this.checkRmq()
    checks.rmq = rmqResult.status
    if (rmqResult.reason) details.rmq = rmqResult.reason

    if (checks.rmq === 'up') {
      const [portfolio, notification] = await Promise.all([
        this.ping(MESSAGE_PATTERNS.HEALTH_PING_PORTFOLIO, 'portfolio_rpc'),
        this.ping(MESSAGE_PATTERNS.HEALTH_PING_NOTIFICATION, 'notification_rpc'),
      ])
      checks.portfolio_rpc = portfolio.status
      checks.notification_rpc = notification.status
      if (portfolio.reason) details.portfolio_rpc = portfolio.reason
      if (notification.reason) details.notification_rpc = notification.reason
    } else {
      details.portfolio_rpc = 'skipped — rmq down'
      details.notification_rpc = 'skipped — rmq down'
    }

    const status = Object.values(checks).every((v) => v === 'up') ? 'ok' : 'degraded'
    const response: HealthResponse = {
      status,
      checks,
      timestamp: new Date().toISOString(),
    }
    if (Object.keys(details).length > 0) response.details = details
    return response
  }

  private async checkDb(): Promise<{ status: CheckStatus; reason?: string }> {
    try {
      await this.prisma.$queryRaw`SELECT 1 FROM gateway."users" LIMIT 1`
      return { status: 'up' }
    } catch (err) {
      const message = errMsg(err)
      this.logger.warn({ event: 'ERROR_GATEWAY_HEALTHZ_DB_DOWN', err: message })
      const reason = /relation .* does not exist/i.test(message)
        ? 'gateway.users table missing — run pnpm prisma:migrate'
        : message
      return { status: 'down', reason }
    }
  }

  private async checkRmq(): Promise<{ status: CheckStatus; reason?: string }> {
    if (!this.amqp) {
      const reason = 'AmqpConnection not injected'
      this.logger.warn({ event: 'ERROR_GATEWAY_HEALTHZ_RMQ_DOWN', err: reason })
      return { status: 'down', reason }
    }
    if (!this.amqp.connected) {
      const reason = 'AMQP channel not connected'
      this.logger.warn({ event: 'ERROR_GATEWAY_HEALTHZ_RMQ_DOWN', err: reason })
      return { status: 'down', reason }
    }
    try {
      // golevelup AmqpConnection does not expose `channel` in its public types,
      // but does carry an underlying amqplib Channel at runtime. If a future
      // version drops/rename it, fall back to the upstream `connected` gate.
      const channel = (this.amqp as unknown as { channel?: ChannelLike }).channel
      if (!channel?.assertExchange) {
        return { status: 'up' }
      }
      await withTimeout(
        channel.assertExchange(RPC_EXCHANGE, 'topic', { durable: true }),
        RMQ_PROBE_TIMEOUT_MS,
        'amqp.assertExchange',
      )
      return { status: 'up' }
    } catch (err) {
      const message = errMsg(err)
      this.logger.warn({ event: 'ERROR_GATEWAY_HEALTHZ_RMQ_DOWN', err: message })
      return { status: 'down', reason: message }
    }
  }

  private async ping(
    routingKey: string,
    field: RpcField,
  ): Promise<{ status: CheckStatus; reason?: string }> {
    const event = RPC_DOWN_EVENT[field]
    try {
      const reply = await this.amqp.request<RpcEnvelope<{ ts: number }>>({
        exchange: RPC_EXCHANGE,
        routingKey,
        payload: {},
        timeout: PING_TIMEOUT_MS,
      })
      if (isRpcEnvelope(reply) && reply.ok === true) {
        return { status: 'up' }
      }
      const reason = `unexpected ping reply: ${JSON.stringify(reply)}`
      this.logger.warn({ event, routingKey, err: reason })
      return { status: 'down', reason }
    } catch (err) {
      const message = errMsg(err)
      this.logger.warn({ event, routingKey, err: message })
      const reason = /timeout|timed out/i.test(message)
        ? `rpc_timeout — downstream not ready or no consumer bound to ${routingKey}`
        : message
      return { status: 'down', reason }
    }
  }
}
