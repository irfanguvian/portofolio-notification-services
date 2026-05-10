import { EXCHANGES, QUEUES, RETRY_TTL_MS, ROUTING_KEYS } from '@acumen/shared'
import { RabbitMQModule } from '@golevelup/nestjs-rabbitmq'
import { Module } from '@nestjs/common'
import { ConfigModule, ConfigService } from '@nestjs/config'

@Module({
  imports: [
    RabbitMQModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (cfg: ConfigService) => ({
        uri: cfg.getOrThrow<string>('RABBITMQ_URL'),
        connectionInitOptions: { wait: true, timeout: 30_000 },
        channels: {
          default: { prefetchCount: 10, default: true },
        },
        exchanges: [
          { name: EXCHANGES.PORTFOLIO_EVENTS, type: 'topic', createExchangeIfNotExists: true },
          { name: EXCHANGES.PORTFOLIO_EVENTS_DLX, type: 'topic', createExchangeIfNotExists: true },
          { name: 'acumen.rpc', type: 'topic', createExchangeIfNotExists: true },
        ],
        queues: [
          {
            name: QUEUES.NOTIFICATION_TX_CREATED_RETRY,
            exchange: EXCHANGES.PORTFOLIO_EVENTS_DLX,
            routingKey: ROUTING_KEYS.TRANSACTION_CREATED_RETRY,
            createQueueIfNotExists: true,
            options: {
              durable: true,
              arguments: {
                'x-message-ttl': RETRY_TTL_MS,
                'x-dead-letter-exchange': EXCHANGES.PORTFOLIO_EVENTS,
                'x-dead-letter-routing-key': ROUTING_KEYS.TRANSACTION_CREATED,
              },
            },
          },
          {
            name: QUEUES.NOTIFICATION_TX_CREATED_DLQ_FINAL,
            exchange: EXCHANGES.PORTFOLIO_EVENTS_DLX,
            routingKey: 'transaction.created.failed',
            createQueueIfNotExists: true,
            options: { durable: true },
          },
        ],
        defaultRpcTimeout: 5000,
        defaultExchangeType: 'topic',
        enableControllerDiscovery: true,
      }),
    }),
  ],
  exports: [RabbitMQModule],
})
export class MessagingModule {}
