import { loadEnv } from '@acumen/shared'
import { z } from 'zod'

const EnvSchema = z.object({
  NODE_ENV: z.string().default('development'),
  LOG_LEVEL: z.string().default('info'),
  NOTIFICATION_HEALTH_PORT: z.coerce.number().int().positive().default(3002),
  DATABASE_URL_NOTIFICATION: z.string().min(1),
  RABBITMQ_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),
  NOTIFICATION_FORCE_FAIL_ONCE: z
    .union([z.literal('true'), z.literal('false'), z.literal('1'), z.literal('0'), z.literal('')])
    .optional()
    .transform((v) => v === 'true' || v === '1'),
})

export type AppEnv = z.infer<typeof EnvSchema>

export function loadAppEnv(source: NodeJS.ProcessEnv = process.env): AppEnv {
  return loadEnv(EnvSchema, source)
}
