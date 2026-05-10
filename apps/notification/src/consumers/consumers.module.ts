import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { MessagingModule } from '../messaging/rabbitmq.module.js'
import { PortfolioRpcClient } from './portfolio-rpc.client.js'
import { TransactionCreatedConsumer } from './transaction-created.consumer.js'

@Module({
  imports: [ConfigModule, MessagingModule],
  providers: [TransactionCreatedConsumer, PortfolioRpcClient],
  exports: [TransactionCreatedConsumer, PortfolioRpcClient],
})
export class ConsumersModule {}
