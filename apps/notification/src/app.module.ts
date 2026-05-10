import { REDACT_PATHS } from '@acumen/shared'
import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { LoggerModule } from 'nestjs-pino'
import { PrismaModule } from './common/prisma.module.js'
import { RedisModule } from './common/redis.module.js'
import { ConsumersModule } from './consumers/consumers.module.js'
import { DeliveryModule } from './delivery/delivery.module.js'
import { HealthModule } from './health/health.module.js'
import { MessagingModule } from './messaging/rabbitmq.module.js'
import { NotificationsModule } from './notifications/notifications.module.js'

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env.LOG_LEVEL ?? 'info',
        base: { service: 'notification' },
        redact: { paths: REDACT_PATHS, censor: '[REDACTED]', remove: false },
      },
    }),
    PrismaModule,
    RedisModule,
    DeliveryModule,
    MessagingModule,
    ConsumersModule,
    NotificationsModule,
    HealthModule,
  ],
})
export class AppModule {}
