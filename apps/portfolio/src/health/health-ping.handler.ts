import { MESSAGE_PATTERNS, type RpcEnvelope, ok } from '@acumen/shared'
import { RabbitRPC } from '@golevelup/nestjs-rabbitmq'
import { Injectable } from '@nestjs/common'

@Injectable()
export class HealthPingHandler {
  @RabbitRPC({
    exchange: 'acumen.rpc',
    routingKey: MESSAGE_PATTERNS.HEALTH_PING_PORTFOLIO,
    queue: 'portfolio.health.ping',
    queueOptions: { durable: false, autoDelete: true },
    createQueueIfNotExists: true,
  })
  async ping(): Promise<RpcEnvelope<{ service: 'portfolio'; ts: number }>> {
    return ok({ service: 'portfolio', ts: Date.now() })
  }
}
