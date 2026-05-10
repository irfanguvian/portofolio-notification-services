import { Module } from '@nestjs/common'
import { HealthController } from './health.controller.js'
import { HealthPingHandler } from './health-ping.handler.js'

@Module({
  controllers: [HealthController],
  providers: [HealthPingHandler],
})
export class HealthModule {}
