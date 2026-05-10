import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module.js'
import { PreferencesController } from './preferences.controller.js'

@Module({
  imports: [AuthModule],
  controllers: [PreferencesController],
})
export class PreferencesModule {}
