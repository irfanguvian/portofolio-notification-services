import { MESSAGE_PATTERNS } from '@acumen/shared'
import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common'
import { type AuthUser, CurrentUser } from '../common/decorators/current-user.decorator.js'
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js'
import { RpcClient } from '../common/rmq/rpc.client.js'
import { SetRuleDto } from './dto.js'

@Controller('rules')
@UseGuards(JwtAuthGuard)
export class RulesController {
  constructor(private readonly rpc: RpcClient) {}

  @Post()
  @HttpCode(200)
  async set(@CurrentUser() user: AuthUser, @Body() dto: SetRuleDto) {
    return this.rpc.request(MESSAGE_PATTERNS.RULES_SET, {
      userId: user.id,
      eventType: dto.eventType,
      enabled: dto.enabled,
    })
  }
}
