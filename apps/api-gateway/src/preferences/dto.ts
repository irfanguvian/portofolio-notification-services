import { IsBoolean, IsIn, IsString } from 'class-validator'

export class SetPreferenceDto {
  @IsString()
  @IsIn(['EMAIL', 'SMS', 'PUSH'])
  channel!: 'EMAIL' | 'SMS' | 'PUSH'

  @IsBoolean()
  enabled!: boolean
}
