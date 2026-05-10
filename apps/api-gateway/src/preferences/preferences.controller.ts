import { MESSAGE_PATTERNS } from '@acumen/shared'
import { Body, Controller, Get, HttpCode, Post, UseGuards } from '@nestjs/common'
import { type AuthUser, CurrentUser } from '../common/decorators/current-user.decorator.js'
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js'
import { RpcClient } from '../common/rmq/rpc.client.js'
import { SetPreferenceDto } from './dto.js'

@Controller('preferences')
@UseGuards(JwtAuthGuard)
export class PreferencesController {
  constructor(private readonly rpc: RpcClient) {}

  @Post()
  @HttpCode(200)
  async set(@CurrentUser() user: AuthUser, @Body() dto: SetPreferenceDto) {
    return this.rpc.request(MESSAGE_PATTERNS.PREFS_SET, {
      userId: user.id,
      channel: dto.channel,
      enabled: dto.enabled,
    })
  }

  @Get()
  async get(@CurrentUser() user: AuthUser) {
    return this.rpc.request(MESSAGE_PATTERNS.PREFS_GET, { userId: user.id })
  }
}
