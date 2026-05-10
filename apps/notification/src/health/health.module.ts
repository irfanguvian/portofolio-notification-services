import { Module } from '@nestjs/common'
import { MessagingModule } from '../messaging/rabbitmq.module.js'
import { HealthController } from './health.controller.js'
import { HealthPingHandler } from './health-ping.handler.js'

@Module({
  imports: [MessagingModule],
  controllers: [HealthController],
  providers: [HealthPingHandler],
})
export class HealthModule {}
