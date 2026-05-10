import { execSync } from 'node:child_process'
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql'
import { RabbitMQContainer, type StartedRabbitMQContainer } from '@testcontainers/rabbitmq'
import { RedisContainer, type StartedRedisContainer } from '@testcontainers/redis'
import { afterAll, beforeAll } from 'vitest'

declare global {
  // eslint-disable-next-line no-var
  var __ACUMEN_PG__: StartedPostgreSqlContainer | undefined
  // eslint-disable-next-line no-var
  var __ACUMEN_RMQ__: StartedRabbitMQContainer | undefined
  // eslint-disable-next-line no-var
  var __ACUMEN_REDIS__: StartedRedisContainer | undefined
}

beforeAll(async () => {
  const pg = await new PostgreSqlContainer('postgres:16-alpine')
    .withDatabase('acumen_test')
    .withUsername('acumen')
    .withPassword('acumen')
    .start()

  const rmq = await new RabbitMQContainer('rabbitmq:3.13-management-alpine').start()
  const redis = await new RedisContainer('redis:7-alpine').start()

  globalThis.__ACUMEN_PG__ = pg
  globalThis.__ACUMEN_RMQ__ = rmq
  globalThis.__ACUMEN_REDIS__ = redis

  const pgUrl = `postgresql://acumen:acumen@${pg.getHost()}:${pg.getMappedPort(5432)}/acumen_test?schema=portfolio`
  const rmqUrl = `amqp://${rmq.getHost()}:${rmq.getMappedPort(5672)}`
  const redisUrl = `redis://${redis.getHost()}:${redis.getMappedPort(6379)}`

  process.env.DATABASE_URL_PORTFOLIO = pgUrl
  process.env.RABBITMQ_URL = rmqUrl
  process.env.REDIS_URL = redisUrl
  process.env.PORTFOLIO_HEALTH_PORT = '0'
  process.env.NODE_ENV = 'test'
  process.env.LOG_LEVEL = 'error'

  // Create schema inside the postgres container so migrate deploy can apply
  await pg.exec([
    'psql',
    '-U',
    'acumen',
    '-d',
    'acumen_test',
    '-c',
    'CREATE SCHEMA IF NOT EXISTS portfolio',
  ])

  execSync('pnpm prisma migrate deploy', {
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL_PORTFOLIO: pgUrl },
    cwd: new URL('../..', import.meta.url).pathname,
  })
}, 180_000)

afterAll(async () => {
  await globalThis.__ACUMEN_PG__?.stop()
  await globalThis.__ACUMEN_RMQ__?.stop()
  await globalThis.__ACUMEN_REDIS__?.stop()
}, 60_000)
