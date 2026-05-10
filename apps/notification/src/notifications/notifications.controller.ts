import {
  fail,
  MESSAGE_PATTERNS,
  type NotificationRecord,
  NotificationListCommandSchema,
  ok,
  type RpcEnvelope,
} from '@acumen/shared'
import { RabbitRPC } from '@golevelup/nestjs-rabbitmq'
import { Controller, Logger } from '@nestjs/common'
import { PrismaService } from '../common/prisma.service.js'

@Controller()
export class NotificationsController {
  private readonly logger = new Logger(NotificationsController.name)

  constructor(private readonly prisma: PrismaService) {}

  @RabbitRPC({
    exchange: 'acumen.rpc',
    routingKey: MESSAGE_PATTERNS.NOTIFICATIONS_LIST,
    queue: 'notification.rpc.list',
    queueOptions: { durable: true },
    createQueueIfNotExists: true,
  })
  async list(payload: unknown): Promise<RpcEnvelope<NotificationRecord[]>> {
    const parsed = NotificationListCommandSchema.safeParse(payload)
    if (!parsed.success) {
      this.logger.warn({
        msg: 'ERROR_NOTIFICATION_RPC_LIST_INVALID',
        issues: parsed.error.issues,
      })
      return fail('VALIDATION_ERROR', 'Invalid NOTIFICATIONS_LIST payload', parsed.error.flatten())
    }
    const rows = await this.prisma.notification.findMany({
      where: { userId: parsed.data.userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    })
    const records: NotificationRecord[] = rows.map((n) => ({
      id: n.id,
      userId: n.userId,
      eventType: n.eventType as NotificationRecord['eventType'],
      channel: n.channel as NotificationRecord['channel'],
      payload: (n.payload ?? {}) as Record<string, unknown>,
      status: n.status as NotificationRecord['status'],
      attempts: n.attempts,
      createdAt: n.createdAt.toISOString(),
    }))
    return ok(records)
  }
}
