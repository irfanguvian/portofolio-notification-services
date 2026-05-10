import { type DynamicModule, Module } from '@nestjs/common'
import { LoggerModule } from 'nestjs-pino'
import { CommonModule } from './common/common.module.js'
import { loadPortfolioEnv } from './config/env.js'
import { HealthModule } from './health/health.module.js'
import { PreferencesModule } from './preferences/preferences.module.js'
import { RulesModule } from './rules/rules.module.js'
import { TransactionsModule } from './transactions/transactions.module.js'

@Module({})
export class AppModule {
  static register(): DynamicModule {
    const env = loadPortfolioEnv()
    return {
      module: AppModule,
      imports: [
        LoggerModule.forRoot({
          pinoHttp: {
            level: env.LOG_LEVEL,
            base: { service: 'portfolio' },
            redact: {
              paths: [
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
              ],
              censor: '[REDACTED]',
            },
            ...(env.NODE_ENV === 'development'
              ? { transport: { target: 'pino-pretty', options: { singleLine: true } } }
              : {}),
          },
        }),
        CommonModule.register(env.RABBITMQ_URL),
        TransactionsModule,
        PreferencesModule,
        RulesModule,
        HealthModule,
      ],
    }
  }
}
