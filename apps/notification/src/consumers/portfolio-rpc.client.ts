import {
  MESSAGE_PATTERNS,
  type PreferenceRecord,
  type RpcEnvelope,
  type RuleRecord,
  isRpcEnvelope,
} from '@acumen/shared'
import { AmqpConnection } from '@golevelup/nestjs-rabbitmq'
import { Injectable, Logger } from '@nestjs/common'

function unwrap<T>(reply: unknown): T | null {
  if (reply == null) return null
  if (isRpcEnvelope(reply)) {
    const env = reply as RpcEnvelope<T>
    return env.ok ? env.data : null
  }
  return reply as T
}

@Injectable()
export class PortfolioRpcClient {
  private readonly logger = new Logger(PortfolioRpcClient.name)

  constructor(private readonly amqp: AmqpConnection) {}

  async getPreference(userId: string): Promise<PreferenceRecord | null> {
    try {
      const reply = await this.amqp.request<unknown>({
        exchange: 'acumen.rpc',
        routingKey: MESSAGE_PATTERNS.PREFS_GET,
        payload: { userId },
        timeout: 5000,
      })
      return unwrap<PreferenceRecord | null>(reply)
    } catch (err) {
      this.logger.warn({ msg: 'ERROR_NOTIFICATION_RPC_PREFS_GET', userId, err: String(err) })
      return null
    }
  }

  async getRule(userId: string): Promise<RuleRecord | null> {
    try {
      const reply = await this.amqp.request<unknown>({
        exchange: 'acumen.rpc',
        routingKey: MESSAGE_PATTERNS.RULES_GET,
        payload: { userId },
        timeout: 5000,
      })
      const unwrapped = unwrap<RuleRecord | RuleRecord[] | null>(reply)
      if (!unwrapped) return null
      if (Array.isArray(unwrapped)) {
        return unwrapped.find((r) => r.eventType === 'TRADE_EXECUTED') ?? null
      }
      return unwrapped
    } catch (err) {
      this.logger.warn({ msg: 'ERROR_NOTIFICATION_RPC_RULES_GET', userId, err: String(err) })
      return null
    }
  }
}
