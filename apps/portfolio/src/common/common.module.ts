import { EXCHANGES } from '@acumen/shared'
import { RabbitMQModule } from '@golevelup/nestjs-rabbitmq'
import { type DynamicModule, Global, Module } from '@nestjs/common'
import { Redis } from 'ioredis'
import { PrismaService } from './prisma.service.js'
import { REDIS_CLIENT, RedisService } from './redis.service.js'

@Global()
@Module({})
export class CommonModule {
  static register(rabbitUri: string): DynamicModule {
    const rabbit = RabbitMQModule.forRoot({
      uri: rabbitUri,
      exchanges: [
        { name: EXCHANGES.PORTFOLIO_EVENTS, type: 'topic', createExchangeIfNotExists: true },
        { name: EXCHANGES.PORTFOLIO_EVENTS_DLX, type: 'topic', createExchangeIfNotExists: true },
        { name: 'acumen.rpc', type: 'topic', createExchangeIfNotExists: true },
      ],
      connectionInitOptions: { wait: true, timeout: 30_000 },
      enableDirectReplyTo: true,
      registerHandlers: true,
      channels: {
        default: { prefetchCount: 10, default: true },
      },
    })

    return {
      module: CommonModule,
      global: true,
      imports: [rabbit],
      providers: [
        PrismaService,
        {
          provide: REDIS_CLIENT,
          useFactory: () => {
            const url = process.env.REDIS_URL
            if (!url) throw new Error('REDIS_URL is required')
            return new Redis(url, {
              lazyConnect: false,
              maxRetriesPerRequest: 3,
              enableReadyCheck: true,
            })
          },
        },
        RedisService,
      ],
      exports: [PrismaService, RedisService, REDIS_CLIENT, rabbit],
    }
  }
}
