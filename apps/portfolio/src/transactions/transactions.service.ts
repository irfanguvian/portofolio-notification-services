import {
  EXCHANGES,
  ROUTING_KEYS,
  type TransactionCreateCommand,
  type TransactionCreatedEvent,
  type TransactionListCommand,
  type TransactionRecord,
} from '@acumen/shared'
import { AmqpConnection } from '@golevelup/nestjs-rabbitmq'
import { Injectable, Logger } from '@nestjs/common'
import { PrismaService } from '../common/prisma.service.js'
import { RedisService } from '../common/redis.service.js'

const CACHE_TTL_SECONDS = 30
const cacheKey = (userId: string) => `tx:list:${userId}`

@Injectable()
export class TransactionsService {
  private readonly logger = new Logger(TransactionsService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly amqp: AmqpConnection,
  ) {}

  async create(cmd: TransactionCreateCommand): Promise<TransactionRecord> {
    const row = await this.prisma.transaction.create({
      data: {
        userId: cmd.userId,
        symbol: cmd.symbol,
        type: cmd.type,
        qty: cmd.qty,
        price: cmd.price,
      },
    })

    await this.redis.del(cacheKey(cmd.userId))

    const event: TransactionCreatedEvent = {
      transactionId: row.id,
      userId: row.userId,
      symbol: row.symbol,
      type: row.type,
      qty: Number(row.qty),
      price: Number(row.price),
      occurredAt: row.createdAt.toISOString(),
    }

    await this.amqp.publish(EXCHANGES.PORTFOLIO_EVENTS, ROUTING_KEYS.TRANSACTION_CREATED, event, {
      persistent: true,
      contentType: 'application/json',
    })

    this.logger.log({
      msg: 'FEATURE_PORTFOLIO_TX_CREATED',
      transactionId: row.id,
      userId: row.userId,
      symbol: row.symbol,
      type: row.type,
    })

    return this.toRecord(row)
  }

  async list(cmd: TransactionListCommand): Promise<TransactionRecord[]> {
    const key = cacheKey(cmd.userId)
    const cached = await this.redis.get<TransactionRecord[]>(key)
    if (cached) {
      this.logger.debug({ msg: 'FEATURE_PORTFOLIO_TX_LIST_CACHE_HIT', userId: cmd.userId })
      return cached
    }

    const rows = await this.prisma.transaction.findMany({
      where: { userId: cmd.userId },
      orderBy: { createdAt: 'desc' },
    })
    const records = rows.map((r) => this.toRecord(r))
    await this.redis.setJson(key, records, CACHE_TTL_SECONDS)
    this.logger.debug({
      msg: 'FEATURE_PORTFOLIO_TX_LIST_CACHE_MISS',
      userId: cmd.userId,
      count: records.length,
    })
    return records
  }

  private toRecord(row: {
    id: string
    userId: string
    symbol: string
    type: 'BUY' | 'SELL'
    qty: { toString(): string } | number
    price: { toString(): string } | number
    createdAt: Date
  }): TransactionRecord {
    return {
      id: row.id,
      userId: row.userId,
      symbol: row.symbol,
      type: row.type,
      qty: Number(row.qty),
      price: Number(row.price),
      createdAt: row.createdAt.toISOString(),
    }
  }
}
