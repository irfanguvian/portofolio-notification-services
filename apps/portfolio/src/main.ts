import 'reflect-metadata'
import { NestFactory } from '@nestjs/core'
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify'
import { Logger as PinoLogger } from 'nestjs-pino'
import { AppModule } from './app.module.js'
import { loadPortfolioEnv } from './config/env.js'

async function bootstrap(): Promise<void> {
  const env = loadPortfolioEnv()
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule.register(),
    new FastifyAdapter({ logger: false }),
    { bufferLogs: true },
  )
  app.useLogger(app.get(PinoLogger))
  app.enableShutdownHooks()

  await app.listen(env.PORTFOLIO_HEALTH_PORT, '0.0.0.0')
  console.log(`[portfolio] listening on ${env.PORTFOLIO_HEALTH_PORT}`)
}

bootstrap().catch((err) => {
  console.error('[portfolio] FATAL', err)
  process.exit(1)
})
