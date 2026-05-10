import {
  fail,
  MESSAGE_PATTERNS,
  ok,
  type RpcEnvelope,
  RuleGetCommandSchema,
  type RuleRecord,
  RuleSetCommandSchema,
} from '@acumen/shared'
import { RabbitRPC } from '@golevelup/nestjs-rabbitmq'
import { Injectable, Logger } from '@nestjs/common'
import { RulesService } from './rules.service.js'

@Injectable()
export class RulesController {
  private readonly logger = new Logger(RulesController.name)

  constructor(private readonly service: RulesService) {}

  @RabbitRPC({
    exchange: 'acumen.rpc',
    routingKey: MESSAGE_PATTERNS.RULES_SET,
    queue: 'portfolio.commands.rules-set',
    queueOptions: { durable: true },
  })
  async setRule(payload: unknown): Promise<RpcEnvelope<RuleRecord>> {
    const parsed = RuleSetCommandSchema.safeParse(payload)
    if (!parsed.success) {
      this.logger.warn({ msg: 'ERROR_PORTFOLIO_RULES_SET_INVALID' })
      return fail('VALIDATION_ERROR', 'Invalid RULES_SET payload', parsed.error.flatten())
    }
    return ok(await this.service.set(parsed.data))
  }

  @RabbitRPC({
    exchange: 'acumen.rpc',
    routingKey: MESSAGE_PATTERNS.RULES_GET,
    queue: 'portfolio.commands.rules-get',
    queueOptions: { durable: true },
  })
  async listRules(payload: unknown): Promise<RpcEnvelope<RuleRecord[]>> {
    const parsed = RuleGetCommandSchema.safeParse(payload)
    if (!parsed.success) {
      this.logger.warn({ msg: 'ERROR_PORTFOLIO_RULES_GET_INVALID' })
      return fail('VALIDATION_ERROR', 'Invalid RULES_GET payload', parsed.error.flatten())
    }
    return ok(await this.service.list(parsed.data))
  }
}
