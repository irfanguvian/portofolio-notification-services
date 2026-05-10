import { loadEnv } from '@acumen/shared'
import { z } from 'zod'

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  GATEWAY_PORT: z.coerce.number().int().nonnegative().default(3000),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  JWT_EXPIRES_IN: z.string().default('1h'),
  DATABASE_URL_GATEWAY: z.string().url(),
  RABBITMQ_URL: z.string().url(),
  RPC_TIMEOUT_MS: z.coerce.number().int().positive().default(8000),
  CORS_ORIGIN: z.string().default('*'),
})

export type AppEnv = z.infer<typeof EnvSchema>

export function loadAppEnv(source: NodeJS.ProcessEnv = process.env): AppEnv {
  return loadEnv(EnvSchema, source)
}

export const ENV_TOKEN = 'ENV_TOKEN'
