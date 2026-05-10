import { IsIn, IsNumber, IsOptional, IsString, MaxLength, Min, MinLength } from 'class-validator'

export class CreateTransactionDto {
  @IsString()
  @MinLength(1)
  @MaxLength(10)
  symbol!: string

  @IsString()
  @IsIn(['BUY', 'SELL'])
  type!: 'BUY' | 'SELL'

  @IsNumber()
  @Min(0.0000001)
  qty!: number

  @IsNumber()
  @Min(0.0000001)
  price!: number

  @IsOptional()
  @IsString()
  @MaxLength(128)
  idempotencyKey?: string
}
