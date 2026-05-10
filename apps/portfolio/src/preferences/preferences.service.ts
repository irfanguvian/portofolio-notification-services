import type { PreferenceGetCommand, PreferenceRecord, PreferenceSetCommand } from '@acumen/shared'
import { Injectable, Logger } from '@nestjs/common'
import { PrismaService } from '../common/prisma.service.js'
import { RedisService } from '../common/redis.service.js'

const TTL = 60
const key = (userId: string) => `prefs:${userId}`

@Injectable()
export class PreferencesService {
  private readonly logger = new Logger(PreferencesService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async set(cmd: PreferenceSetCommand): Promise<PreferenceRecord> {
    const row = await this.prisma.userPreference.upsert({
      where: { userId: cmd.userId },
      create: { userId: cmd.userId, channel: cmd.channel, enabled: cmd.enabled },
      update: { channel: cmd.channel, enabled: cmd.enabled },
    })
    await this.redis.del(key(cmd.userId))
    this.logger.log({
      msg: 'FEATURE_PORTFOLIO_PREFS_SET',
      userId: row.userId,
      channel: row.channel,
      enabled: row.enabled,
    })
    return { userId: row.userId, channel: row.channel, enabled: row.enabled }
  }

  async get(cmd: PreferenceGetCommand): Promise<PreferenceRecord | null> {
    const cached = await this.redis.get<PreferenceRecord>(key(cmd.userId))
    if (cached) return cached

    const row = await this.prisma.userPreference.findUnique({ where: { userId: cmd.userId } })
    if (!row) return null
    const record: PreferenceRecord = {
      userId: row.userId,
      channel: row.channel,
      enabled: row.enabled,
    }
    await this.redis.setJson(key(cmd.userId), record, TTL)
    return record
  }
}
