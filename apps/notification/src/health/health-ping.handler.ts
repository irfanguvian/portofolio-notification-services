import { MESSAGE_PATTERNS, type RpcEnvelope, ok } from '@acumen/shared'
import { RabbitRPC } from '@golevelup/nestjs-rabbitmq'
import { Injectable } from '@nestjs/common'

@Injectable()
export class HealthPingHandler {
  @RabbitRPC({
    exchange: 'acumen.rpc',
    routingKey: MESSAGE_PATTERNS.HEALTH_PING_NOTIFICATION,
    queue: 'notification.health.ping',
    queueOptions: { durable: false, autoDelete: true },
    createQueueIfNotExists: true,
  })
  async ping(): Promise<RpcEnvelope<{ service: 'notification'; ts: number }>> {
    return ok({ service: 'notification', ts: Date.now() })
  }
}
