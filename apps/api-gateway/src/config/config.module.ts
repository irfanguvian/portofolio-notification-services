import { Global, Module } from '@nestjs/common'
import { ENV_TOKEN, loadAppEnv } from './env.js'

@Global()
@Module({
  providers: [
    {
      provide: ENV_TOKEN,
      useFactory: () => loadAppEnv(),
    },
  ],
  exports: [ENV_TOKEN],
})
export class ConfigModule {}
