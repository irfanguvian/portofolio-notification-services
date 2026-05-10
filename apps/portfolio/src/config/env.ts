import { loadEnv } from '@acumen/shared'
import { z } from 'zod'

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z.string().default('info'),
  PORTFOLIO_HEALTH_PORT: z.coerce.number().int().nonnegative().default(3001),
  DATABASE_URL_PORTFOLIO: z.string().url(),
  RABBITMQ_URL: z.string().url(),
  REDIS_URL: z.string().url(),
})

export type PortfolioEnv = z.infer<typeof EnvSchema>

export function loadPortfolioEnv(source: NodeJS.ProcessEnv = process.env): PortfolioEnv {
  return loadEnv(EnvSchema, source)
}
