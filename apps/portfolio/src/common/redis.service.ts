import { Inject, Injectable, type OnModuleDestroy } from '@nestjs/common'
import { Redis } from 'ioredis'

export const REDIS_CLIENT = Symbol('REDIS_CLIENT')

@Injectable()
export class RedisService implements OnModuleDestroy {
  constructor(@Inject(REDIS_CLIENT) public readonly client: Redis) {}

  async get<T = unknown>(key: string): Promise<T | null> {
    const raw = await this.client.get(key)
    if (raw === null) return null
    try {
      return JSON.parse(raw) as T
    } catch {
      return raw as unknown as T
    }
  }

  async setJson(key: string, value: unknown, ttlSeconds: number): Promise<void> {
    await this.client.set(key, JSON.stringify(value), 'EX', ttlSeconds)
  }

  async del(key: string): Promise<void> {
    await this.client.del(key)
  }

  async ping(): Promise<boolean> {
    const reply = await this.client.ping()
    return reply === 'PONG'
  }

  async onModuleDestroy(): Promise<void> {
    this.client.disconnect()
  }
}
