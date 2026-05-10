import { Module } from '@nestjs/common'
import { HealthPingHandler } from './health-ping.handler.js'
import { HealthController } from './health.controller.js'

@Module({
  controllers: [HealthController],
  providers: [HealthPingHandler],
})
export class HealthModule {}
