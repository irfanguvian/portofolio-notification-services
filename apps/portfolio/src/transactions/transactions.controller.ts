import {
  MESSAGE_PATTERNS,
  QUEUES,
  type RpcEnvelope,
  TransactionCreateCommandSchema,
  TransactionListCommandSchema,
  type TransactionRecord,
  fail,
  ok,
} from '@acumen/shared'
import { RabbitRPC } from '@golevelup/nestjs-rabbitmq'
import { Injectable, Logger } from '@nestjs/common'
import { TransactionsService } from './transactions.service.js'

@Injectable()
export class TransactionsController {
  private readonly logger = new Logger(TransactionsController.name)

  constructor(private readonly service: TransactionsService) {}

  @RabbitRPC({
    exchange: 'acumen.rpc',
    routingKey: MESSAGE_PATTERNS.TX_CREATE,
    queue: QUEUES.PORTFOLIO_COMMANDS,
    queueOptions: { durable: true },
  })
  async createTransaction(payload: unknown): Promise<RpcEnvelope<TransactionRecord>> {
    const parsed = TransactionCreateCommandSchema.safeParse(payload)
    if (!parsed.success) {
      this.logger.warn({
        msg: 'ERROR_PORTFOLIO_TX_CREATE_INVALID',
        issues: parsed.error.flatten(),
      })
      return fail('VALIDATION_ERROR', 'Invalid TX_CREATE payload', parsed.error.flatten())
    }
    return ok(await this.service.create(parsed.data))
  }

  @RabbitRPC({
    exchange: 'acumen.rpc',
    routingKey: MESSAGE_PATTERNS.TX_LIST,
    queue: `${QUEUES.PORTFOLIO_COMMANDS}.tx-list`,
    queueOptions: { durable: true },
  })
  async listTransactions(payload: unknown): Promise<RpcEnvelope<TransactionRecord[]>> {
    const parsed = TransactionListCommandSchema.safeParse(payload)
    if (!parsed.success) {
      this.logger.warn({
        msg: 'ERROR_PORTFOLIO_TX_LIST_INVALID',
        issues: parsed.error.flatten(),
      })
      return fail('VALIDATION_ERROR', 'Invalid TX_LIST payload', parsed.error.flatten())
    }
    return ok(await this.service.list(parsed.data))
  }
}
