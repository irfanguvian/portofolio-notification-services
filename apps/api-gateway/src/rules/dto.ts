import { IsBoolean, IsIn, IsString } from 'class-validator'

export class SetRuleDto {
  @IsString()
  @IsIn(['TRADE_EXECUTED'])
  eventType!: 'TRADE_EXECUTED'

  @IsBoolean()
  enabled!: boolean
}
