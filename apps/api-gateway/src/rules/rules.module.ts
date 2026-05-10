import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module.js'
import { RulesController } from './rules.controller.js'

@Module({
  imports: [AuthModule],
  controllers: [RulesController],
})
export class RulesModule {}
