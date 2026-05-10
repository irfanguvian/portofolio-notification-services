import {
  EXCHANGES,
  MAX_RETRIES,
  QUEUES,
  ROUTING_KEYS,
  type TransactionCreatedEvent,
  TransactionCreatedEventSchema,
} from '@acumen/shared'
import {
  AmqpConnection,
  MessageHandlerErrorBehavior,
  RabbitSubscribe,
} from '@golevelup/nestjs-rabbitmq'
import { Injectable, Logger } from '@nestjs/common'
import type { ConsumeMessage } from 'amqplib'
import { PrismaService } from '../common/prisma.service.js'
import { ConsoleDeliveryService } from '../delivery/console-delivery.service.js'
import { PortfolioRpcClient } from './portfolio-rpc.client.js'

interface XDeathEntry {
  count?: number
  reason?: string
  queue?: string
  exchange?: string
  'routing-keys'?: string[]
}

function getRetryCount(headers: Record<string, unknown> | undefined): number {
  if (!headers) return 0
  const xDeath = headers['x-death']
  if (!Array.isArray(xDeath)) return 0
  let total = 0
  for (const entry of xDeath as XDeathEntry[]) {
    if (entry?.queue === QUEUES.NOTIFICATION_TX_CREATED && typeof entry.count === 'number') {
      total += entry.count
    }
  }
  return total
}

@Injectable()
export class TransactionCreatedConsumer {
  private readonly logger = new Logger(TransactionCreatedConsumer.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly delivery: ConsoleDeliveryService,
    private readonly portfolio: PortfolioRpcClient,
    private readonly amqp: AmqpConnection,
  ) {}

  @RabbitSubscribe({
    exchange: EXCHANGES.PORTFOLIO_EVENTS,
    routingKey: ROUTING_KEYS.TRANSACTION_CREATED,
    queue: QUEUES.NOTIFICATION_TX_CREATED,
    queueOptions: {
      durable: true,
      arguments: {
        'x-dead-letter-exchange': EXCHANGES.PORTFOLIO_EVENTS_DLX,
        'x-dead-letter-routing-key': ROUTING_KEYS.TRANSACTION_CREATED_RETRY,
      },
    },
    errorBehavior: MessageHandlerErrorBehavior.NACK,
    allowNonJsonMessages: false,
  })
  async handle(payload: unknown, rawMsg?: ConsumeMessage): Promise<void> {
    const parsed = TransactionCreatedEventSchema.safeParse(payload)
    if (!parsed.success) {
      this.logger.error({
        msg: 'ERROR_NOTIFICATION_INVALID_EVENT',
        issues: parsed.error.issues,
      })
      return
    }
    const event: TransactionCreatedEvent = parsed.data

    const headers = rawMsg?.properties?.headers as Record<string, unknown> | undefined
    const retryCount = getRetryCount(headers)

    if (retryCount >= MAX_RETRIES) {
      await this.parkAsDead(event, retryCount)
      return
    }

    const [pref, rule] = await Promise.all([
      this.portfolio.getPreference(event.userId),
      this.portfolio.getRule(event.userId),
    ])

    if (!pref?.enabled || !rule?.enabled) {
      this.logger.log({
        msg: 'FEATURE_NOTIFICATION_SKIPPED',
        userId: event.userId,
        eventType: 'TRADE_EXECUTED',
        prefEnabled: pref?.enabled ?? false,
        ruleEnabled: rule?.enabled ?? false,
      })
      return
    }

    const channel = pref.channel
    const notification = await this.prisma.notification.create({
      data: {
        userId: event.userId,
        eventType: 'TRADE_EXECUTED',
        channel,
        payload: { transactionId: event.transactionId, symbol: event.symbol, type: event.type },
        status: 'PENDING',
        attempts: retryCount,
      },
    })

    try {
      await this.delivery.deliver({
        notificationId: notification.id,
        userId: event.userId,
        eventType: 'TRADE_EXECUTED',
        channel,
      })
      await this.prisma.notification.update({
        where: { id: notification.id },
        data: { status: 'SENT', attempts: { increment: 1 } },
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      await this.prisma.notification.update({
        where: { id: notification.id },
        data: { status: 'FAILED', attempts: { increment: 1 }, lastError: message },
      })
      this.logger.warn({
        msg: 'ERROR_NOTIFICATION_DELIVERY_FAILED',
        notificationId: notification.id,
        retryCount,
        err: message,
      })
      throw err
    }
  }

  private async parkAsDead(event: TransactionCreatedEvent, retryCount: number): Promise<void> {
    this.logger.error({
      msg: 'ERROR_NOTIFICATION_DLQ_FINAL',
      userId: event.userId,
      transactionId: event.transactionId,
      retryCount,
    })
    await this.prisma.notification.create({
      data: {
        userId: event.userId,
        eventType: 'TRADE_EXECUTED',
        channel: 'EMAIL',
        payload: { transactionId: event.transactionId, symbol: event.symbol, type: event.type },
        status: 'DEAD',
        attempts: retryCount,
        lastError: 'max retries exceeded',
      },
    })
    await this.amqp.publish(EXCHANGES.PORTFOLIO_EVENTS_DLX, 'transaction.created.failed', event)
  }
}
