import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module.js'
import { PrismaService } from '../auth/prisma.service.js'
import { HealthController } from './health.controller.js'

@Module({
  imports: [AuthModule],
  providers: [PrismaService],
  controllers: [HealthController],
})
export class HealthModule {}
