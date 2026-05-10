import { Module } from '@nestjs/common'
import { TransactionsController } from './transactions.controller.js'
import { TransactionsService } from './transactions.service.js'

@Module({
  providers: [TransactionsService, TransactionsController],
  exports: [TransactionsService],
})
export class TransactionsModule {}
