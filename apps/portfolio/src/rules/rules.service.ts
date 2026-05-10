import type {
  NotificationEventType,
  RuleGetCommand,
  RuleRecord,
  RuleSetCommand,
} from '@acumen/shared'
import { Injectable, Logger } from '@nestjs/common'
import { PrismaService } from '../common/prisma.service.js'
import { RedisService } from '../common/redis.service.js'

const TTL = 60
const key = (userId: string) => `rules:${userId}`

@Injectable()
export class RulesService {
  private readonly logger = new Logger(RulesService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async set(cmd: RuleSetCommand): Promise<RuleRecord> {
    const row = await this.prisma.notificationRule.upsert({
      where: { userId_eventType: { userId: cmd.userId, eventType: cmd.eventType } },
      create: { userId: cmd.userId, eventType: cmd.eventType, enabled: cmd.enabled },
      update: { enabled: cmd.enabled },
    })
    await this.redis.del(key(cmd.userId))
    this.logger.log({
      msg: 'FEATURE_PORTFOLIO_RULE_SET',
      userId: row.userId,
      eventType: row.eventType,
      enabled: row.enabled,
    })
    return {
      id: row.id,
      userId: row.userId,
      eventType: row.eventType as NotificationEventType,
      enabled: row.enabled,
    }
  }

  async list(cmd: RuleGetCommand): Promise<RuleRecord[]> {
    const cached = await this.redis.get<RuleRecord[]>(key(cmd.userId))
    if (cached) return cached
    const rows = await this.prisma.notificationRule.findMany({ where: { userId: cmd.userId } })
    const records: RuleRecord[] = rows.map((r) => ({
      id: r.id,
      userId: r.userId,
      eventType: r.eventType as NotificationEventType,
      enabled: r.enabled,
    }))
    await this.redis.setJson(key(cmd.userId), records, TTL)
    return records
  }
}
