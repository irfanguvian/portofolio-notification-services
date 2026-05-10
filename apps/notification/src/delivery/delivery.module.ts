import { Global, Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { ConsoleDeliveryService } from './console-delivery.service.js'

@Global()
@Module({
  imports: [ConfigModule],
  providers: [ConsoleDeliveryService],
  exports: [ConsoleDeliveryService],
})
export class DeliveryModule {}
