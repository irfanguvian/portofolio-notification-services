import { Inject, Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { RedisService } from '../common/redis.service.js'

export interface DeliveryInput {
  notificationId: string
  userId: string
  eventType: string
  channel: string
}

@Injectable()
export class ConsoleDeliveryService {
  private readonly logger = new Logger(ConsoleDeliveryService.name)

  constructor(
    @Inject(ConfigService) private readonly cfg: ConfigService,
    private readonly redis: RedisService,
  ) {}

  async deliver(input: DeliveryInput): Promise<void> {
    const forceFail = this.cfg.get<string>('NOTIFICATION_FORCE_FAIL_ONCE')
    if (forceFail === 'true' || forceFail === '1') {
      const key = `notif:force-fail:${input.userId}`
      const count = await this.redis.incr(key)
      await this.redis.expire(key, 60)
      if (count === 1) {
        throw new Error('NOTIFICATION_FORCE_FAIL_ONCE: simulated delivery failure')
      }
    }

    this.logger.log({
      msg: 'FEATURE_NOTIFICATION_DELIVERED',
      notificationId: input.notificationId,
      eventType: input.eventType,
      channel: input.channel,
    })
  }
}
