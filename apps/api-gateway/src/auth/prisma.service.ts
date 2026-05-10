import { Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common'
import type { PrismaClient as PrismaClientType } from '../../node_modules/.prisma/client-gateway/index.js'

const CLIENT_PATH = '../../node_modules/.prisma/client-gateway/index.js'

let PrismaClientCtor: new () => PrismaClientType

try {
  const mod = await import(CLIENT_PATH)
  PrismaClientCtor = mod.PrismaClient
} catch (err) {
  console.error(
    JSON.stringify({
      event: 'ERROR_GATEWAY_PRISMA_CLIENT_MISSING',
      file: 'apps/api-gateway/node_modules/.prisma/client-gateway/index.js',
      hint: 'gateway prisma client not generated. Run: pnpm --filter @acumen/api-gateway prisma:generate',
      cause: err instanceof Error ? err.message : String(err),
    }),
  )
  process.exit(1)
}

@Injectable()
export class PrismaService extends PrismaClientCtor implements OnModuleInit, OnModuleDestroy {
  async onModuleInit(): Promise<void> {
    await this.$connect()
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect()
  }
}
