import { EXCHANGES } from '@acumen/shared'
import { RabbitMQModule } from '@golevelup/nestjs-rabbitmq'
import { Global, Module } from '@nestjs/common'
import { type AppEnv, ENV_TOKEN } from '../../config/env.js'
import { RpcClient } from './rpc.client.js'

export const RPC_EXCHANGE = 'acumen.rpc'

@Global()
@Module({
  imports: [
    RabbitMQModule.forRootAsync({
      inject: [ENV_TOKEN],
      useFactory: (env: AppEnv) => ({
        uri: env.RABBITMQ_URL,
        exchanges: [
          {
            name: RPC_EXCHANGE,
            type: 'topic',
            options: { durable: true },
            createExchangeIfNotExists: true,
          },
          {
            name: EXCHANGES.PORTFOLIO_EVENTS,
            type: 'topic',
            options: { durable: true },
            createExchangeIfNotExists: true,
          },
          {
            name: EXCHANGES.PORTFOLIO_EVENTS_DLX,
            type: 'topic',
            options: { durable: true },
            createExchangeIfNotExists: true,
          },
        ],
        connectionInitOptions: { wait: true, timeout: 30_000 },
        // Gateway is RPC-client-only; flip to true if a controller adds @RabbitRPC.
        enableControllerDiscovery: false,
      }),
    }),
  ],
  providers: [RpcClient],
  exports: [RabbitMQModule, RpcClient],
})
export class RmqModule {}
