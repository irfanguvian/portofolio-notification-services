import 'reflect-metadata'
import { NestFactory } from '@nestjs/core'
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify'
import { Logger } from 'nestjs-pino'
import { AppModule } from './app.module.js'
import { loadAppEnv } from './config/env.js'

async function bootstrap() {
  const env = loadAppEnv()
  const app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter(), {
    bufferLogs: true,
  })
  app.useLogger(app.get(Logger))
  app.enableShutdownHooks()
  await app.listen(env.NOTIFICATION_HEALTH_PORT, '0.0.0.0')
  app.get(Logger).log({ msg: 'FEATURE_NOTIFICATION_READY', port: env.NOTIFICATION_HEALTH_PORT })
}

bootstrap().catch((err) => {
  console.error('ERROR_NOTIFICATION_BOOT', err)
  process.exit(1)
})
