import { REDACT_PATHS } from '@acumen/shared'
import { Module } from '@nestjs/common'
import { LoggerModule } from 'nestjs-pino'
import { AuthModule } from './auth/auth.module.js'
import { RmqModule } from './common/rmq/rmq.module.js'
import { ConfigModule } from './config/config.module.js'
import { type AppEnv, ENV_TOKEN } from './config/env.js'
import { HealthModule } from './health/health.module.js'
import { NotificationsModule } from './notifications/notifications.module.js'
import { PortfolioModule } from './portfolio/portfolio.module.js'
import { PreferencesModule } from './preferences/preferences.module.js'
import { RulesModule } from './rules/rules.module.js'

@Module({
  imports: [
    ConfigModule,
    LoggerModule.forRootAsync({
      inject: [ENV_TOKEN],
      useFactory: (env: AppEnv) => ({
        pinoHttp: {
          level: env.LOG_LEVEL,
          base: { service: 'gateway' },
          redact: { paths: REDACT_PATHS, censor: '[REDACTED]' },
          customLogLevel: (_req, res, err) => {
            if (err || res.statusCode >= 500) return 'error'
            if (res.statusCode >= 400) return 'warn'
            return 'info'
          },
          customSuccessMessage: () => 'API_REQUEST_END',
          customReceivedMessage: () => 'API_REQUEST_START',
          customErrorMessage: () => 'API_REQUEST_ERROR',
        },
      }),
    }),
    RmqModule,
    AuthModule,
    PortfolioModule,
    PreferencesModule,
    RulesModule,
    NotificationsModule,
    HealthModule,
  ],
})
export class AppModule {}
