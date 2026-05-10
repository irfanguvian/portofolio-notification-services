import 'reflect-metadata'
import fastifyCors from '@fastify/cors'
import fastifyHelmet from '@fastify/helmet'
import { AmqpConnection } from '@golevelup/nestjs-rabbitmq'
import { ValidationPipe } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify'
import { Logger } from 'nestjs-pino'
import { AppModule } from './app.module.js'
import { PrismaService } from './auth/prisma.service.js'
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter.js'
import { type AppEnv, ENV_TOKEN } from './config/env.js'

export async function bootstrap(): Promise<NestFastifyApplication> {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({ trustProxy: true, bodyLimit: 1_048_576 }),
    { bufferLogs: true },
  )

  app.useLogger(app.get(Logger))

  const env = app.get<AppEnv>(ENV_TOKEN)

  await app.register(fastifyHelmet as never, { contentSecurityPolicy: false })
  await app.register(fastifyCors as never, {
    origin: env.CORS_ORIGIN === '*' ? true : env.CORS_ORIGIN.split(',').map((s) => s.trim()),
    credentials: true,
  })

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
      transformOptions: { enableImplicitConversion: false },
    }),
  )
  app.useGlobalFilters(new AllExceptionsFilter())

  app.enableShutdownHooks()

  await app.listen({ port: env.GATEWAY_PORT, host: '0.0.0.0' })

  const log = app.get(Logger)
  let dbStatus: 'up' | 'down' = 'down'
  try {
    const prisma = app.get(PrismaService)
    await prisma.$queryRaw`SELECT 1`
    dbStatus = 'up'
  } catch (err) {
    log.warn({
      event: 'ERROR_GATEWAY_BOOT_PROBE_DB',
      err: err instanceof Error ? err.message : String(err),
    })
  }
  let amqpStatus: 'connected' | 'pending' = 'pending'
  try {
    const amqp = app.get(AmqpConnection)
    amqpStatus = amqp?.connected ? 'connected' : 'pending'
  } catch (err) {
    log.warn({
      event: 'ERROR_GATEWAY_BOOT_PROBE_AMQP',
      err: err instanceof Error ? err.message : String(err),
    })
  }
  log.log({
    event: 'FEATURE_GATEWAY_READY',
    port: env.GATEWAY_PORT,
    db: dbStatus,
    amqp: amqpStatus,
  })

  return app
}

const isMain = process.argv[1]?.endsWith('main.ts') || process.argv[1]?.endsWith('main.js')
if (isMain) {
  bootstrap().catch((err) => {
    const message = err instanceof Error ? err.message : String(err)
    console.error(
      JSON.stringify({
        event: 'ERROR_GATEWAY_BOOT',
        message,
        stack: err instanceof Error ? err.stack : undefined,
      }),
    )
    process.exit(1)
  })
}
