import {
  MESSAGE_PATTERNS,
  PreferenceGetCommandSchema,
  type PreferenceRecord,
  PreferenceSetCommandSchema,
  type RpcEnvelope,
  fail,
  ok,
} from '@acumen/shared'
import { RabbitRPC } from '@golevelup/nestjs-rabbitmq'
import { Injectable, Logger } from '@nestjs/common'
import { PreferencesService } from './preferences.service.js'

@Injectable()
export class PreferencesController {
  private readonly logger = new Logger(PreferencesController.name)

  constructor(private readonly service: PreferencesService) {}

  @RabbitRPC({
    exchange: 'acumen.rpc',
    routingKey: MESSAGE_PATTERNS.PREFS_SET,
    queue: 'portfolio.commands.prefs-set',
    queueOptions: { durable: true },
  })
  async setPreference(payload: unknown): Promise<RpcEnvelope<PreferenceRecord>> {
    const parsed = PreferenceSetCommandSchema.safeParse(payload)
    if (!parsed.success) {
      this.logger.warn({ msg: 'ERROR_PORTFOLIO_PREFS_SET_INVALID' })
      return fail('VALIDATION_ERROR', 'Invalid PREFS_SET payload', parsed.error.flatten())
    }
    return ok(await this.service.set(parsed.data))
  }

  @RabbitRPC({
    exchange: 'acumen.rpc',
    routingKey: MESSAGE_PATTERNS.PREFS_GET,
    queue: 'portfolio.commands.prefs-get',
    queueOptions: { durable: true },
  })
  async getPreference(payload: unknown): Promise<RpcEnvelope<PreferenceRecord | null>> {
    const parsed = PreferenceGetCommandSchema.safeParse(payload)
    if (!parsed.success) {
      this.logger.warn({ msg: 'ERROR_PORTFOLIO_PREFS_GET_INVALID' })
      return fail('VALIDATION_ERROR', 'Invalid PREFS_GET payload', parsed.error.flatten())
    }
    return ok(await this.service.get(parsed.data))
  }
}
