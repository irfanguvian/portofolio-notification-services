import { MESSAGE_PATTERNS } from '@acumen/shared'
import { Body, Controller, Get, HttpCode, Post, UseGuards } from '@nestjs/common'
import { type AuthUser, CurrentUser } from '../common/decorators/current-user.decorator.js'
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js'
import { RpcClient } from '../common/rmq/rpc.client.js'
import { CreateTransactionDto } from './dto.js'

@Controller('portfolio/transactions')
@UseGuards(JwtAuthGuard)
export class PortfolioController {
  constructor(private readonly rpc: RpcClient) {}

  @Post()
  @HttpCode(201)
  async create(@CurrentUser() user: AuthUser, @Body() dto: CreateTransactionDto) {
    return this.rpc.request(MESSAGE_PATTERNS.TX_CREATE, {
      userId: user.id,
      symbol: dto.symbol,
      type: dto.type,
      qty: dto.qty,
      price: dto.price,
      idempotencyKey: dto.idempotencyKey,
    })
  }

  @Get()
  async list(@CurrentUser() user: AuthUser) {
    return this.rpc.request(MESSAGE_PATTERNS.TX_LIST, { userId: user.id })
  }
}
