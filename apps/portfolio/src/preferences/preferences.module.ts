import { Module } from '@nestjs/common'
import { PreferencesController } from './preferences.controller.js'
import { PreferencesService } from './preferences.service.js'

@Module({
  providers: [PreferencesService, PreferencesController],
  exports: [PreferencesService],
})
export class PreferencesModule {}
