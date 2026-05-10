import { Module } from '@nestjs/common'
import { RulesController } from './rules.controller.js'
import { RulesService } from './rules.service.js'

@Module({
  providers: [RulesService, RulesController],
  exports: [RulesService],
})
export class RulesModule {}
