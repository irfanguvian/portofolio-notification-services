import { Module } from '@nestjs/common'
import { MessagingModule } from '../messaging/rabbitmq.module.js'
import { HealthPingHandler } from './health-ping.handler.js'
import { HealthController } from './health.controller.js'

@Module({
  imports: [MessagingModule],
  controllers: [HealthController],
  providers: [HealthPingHandler],
})
export class HealthModule {}
