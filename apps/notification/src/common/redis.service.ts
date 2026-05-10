import { Inject, Injectable, type OnModuleDestroy } from '@nestjs/common'
import { Redis as RedisClient } from 'ioredis'
import { REDIS_URL } from './tokens.js'

@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly client: RedisClient

  constructor(@Inject(REDIS_URL) url: string) {
    this.client = new RedisClient(url, { lazyConnect: false, maxRetriesPerRequest: 3 })
  }

  incr(key: string): Promise<number> {
    return this.client.incr(key)
  }

  expire(key: string, seconds: number): Promise<number> {
    return this.client.expire(key, seconds)
  }

  async onModuleDestroy(): Promise<void> {
    this.client.disconnect()
  }
}
