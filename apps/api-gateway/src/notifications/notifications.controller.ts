import { MESSAGE_PATTERNS } from '@acumen/shared'
import { Controller, Get, UseGuards } from '@nestjs/common'
import { type AuthUser, CurrentUser } from '../common/decorators/current-user.decorator.js'
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js'
import { RpcClient } from '../common/rmq/rpc.client.js'

@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(private readonly rpc: RpcClient) {}

  @Get()
  async list(@CurrentUser() user: AuthUser) {
    return this.rpc.request(MESSAGE_PATTERNS.NOTIFICATIONS_LIST, { userId: user.id })
  }
}
