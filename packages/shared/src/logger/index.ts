import { type Level, type Logger, type LoggerOptions, pino } from 'pino'
import * as stdSerializers from 'pino-std-serializers'

const REDACT_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  '*.password',
  '*.passwordHash',
  '*.token',
  '*.email',
  '*.phone',
  'authorization',
  'password',
  'passwordHash',
  'token',
  'email',
  'phone',
]

export type LogLevel = Level | 'silent'

export interface CreateLoggerOptions {
  level?: LogLevel
}

export function createLogger(serviceName: string, opts: CreateLoggerOptions = {}): Logger {
  const level = opts.level ?? (process.env.LOG_LEVEL as LogLevel | undefined) ?? 'info'

  const options: LoggerOptions = {
    level,
    base: { service: serviceName },
    timestamp: pino.stdTimeFunctions.isoTime,
    redact: {
      paths: REDACT_PATHS,
      censor: '[REDACTED]',
      remove: false,
    },
    serializers: {
      err: stdSerializers.err,
      error: stdSerializers.err,
      req: stdSerializers.req,
      res: stdSerializers.res,
    },
  }

  return pino(options)
}

export type { Logger } from 'pino'
export { REDACT_PATHS }
