import { isRpcEnvelope, type MessagePattern, type RpcEnvelope } from '@acumen/shared'
import { AmqpConnection } from '@golevelup/nestjs-rabbitmq'
import { Inject, Injectable } from '@nestjs/common'
import { type AppEnv, ENV_TOKEN } from '../../config/env.js'
import { RPC_EXCHANGE } from './rmq.module.js'

export class RpcRequestError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly details?: unknown,
  ) {
    super(message)
    this.name = 'RpcRequestError'
  }
}

@Injectable()
export class RpcClient {
  constructor(
    private readonly amqp: AmqpConnection,
    @Inject(ENV_TOKEN) private readonly env: AppEnv,
  ) {}

  async request<T>(pattern: MessagePattern, payload: Record<string, unknown>): Promise<T> {
    let reply: RpcEnvelope<T> | T | null
    try {
      reply = await this.amqp.request<RpcEnvelope<T> | T>({
        exchange: RPC_EXCHANGE,
        routingKey: pattern,
        payload,
        timeout: this.env.RPC_TIMEOUT_MS,
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      if (/timeout|timed out/i.test(message)) {
        throw new RpcRequestError(
          `RPC ${pattern} timed out after ${this.env.RPC_TIMEOUT_MS}ms`,
          'RPC_TIMEOUT',
        )
      }
      throw new RpcRequestError(`RPC ${pattern} transport error: ${message}`, 'RPC_TRANSPORT_ERROR')
    }

    if (reply == null) {
      return reply as T
    }
    if (isRpcEnvelope(reply)) {
      const envelope = reply as RpcEnvelope<T>
      if (envelope.ok === false) {
        throw new RpcRequestError(
          envelope.error?.message ?? `RPC ${pattern} failed`,
          envelope.error?.code ?? 'RPC_ERROR',
          envelope.error?.details,
        )
      }
      return envelope.data
    }
    return reply as T
  }
}
