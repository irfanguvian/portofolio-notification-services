import { AmqpConnection } from '@golevelup/nestjs-rabbitmq'
import { Controller, Get, Logger } from '@nestjs/common'
import { PrismaService } from '../common/prisma.service.js'
import { RedisService } from '../common/redis.service.js'

@Controller('healthz')
export class HealthController {
  private readonly logger = new Logger(HealthController.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly amqp: AmqpConnection,
  ) {}

  @Get()
  async health(): Promise<{ status: 'ok' | 'degraded'; checks: Record<string, boolean> }> {
    const checks: Record<string, boolean> = {
      postgres: false,
      redis: false,
      rabbitmq: false,
    }

    try {
      await this.prisma.$queryRawUnsafe('SELECT 1')
      checks.postgres = true
    } catch {
      checks.postgres = false
    }

    try {
      checks.redis = await this.redis.ping()
    } catch {
      checks.redis = false
    }

    try {
      checks.rabbitmq = this.amqp.connected
    } catch {
      checks.rabbitmq = false
    }

    const ok = Object.values(checks).every(Boolean)
    this.logger.debug({ msg: 'API_PORTFOLIO_HEALTH_OK', checks })
    return { status: ok ? 'ok' : 'degraded', checks }
  }
}
