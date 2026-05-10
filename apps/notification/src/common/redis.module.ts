import { Global, Module } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { RedisService } from './redis.service.js'
import { REDIS_URL } from './tokens.js'

@Global()
@Module({
  providers: [
    {
      provide: REDIS_URL,
      inject: [ConfigService],
      useFactory: (cfg: ConfigService) => cfg.getOrThrow<string>('REDIS_URL'),
    },
    RedisService,
  ],
  exports: [RedisService],
})
export class RedisModule {}
