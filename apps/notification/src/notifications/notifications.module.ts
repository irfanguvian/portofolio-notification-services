import { Module } from '@nestjs/common'
import { MessagingModule } from '../messaging/rabbitmq.module.js'
import { NotificationsController } from './notifications.controller.js'

@Module({
  imports: [MessagingModule],
  controllers: [NotificationsController],
})
export class NotificationsModule {}
