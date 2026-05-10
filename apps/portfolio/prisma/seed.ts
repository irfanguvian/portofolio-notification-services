import { PrismaClient } from '@prisma/client'
import { v5 as uuidv5 } from 'uuid'
import { SEED_NAMESPACE, SEED_SYMBOLS, SEED_USERS } from './seed/index.js'

const prisma = new PrismaClient()

async function main(): Promise<void> {
  for (const user of SEED_USERS) {
    await prisma.userPreference.upsert({
      where: { userId: user.id },
      create: { userId: user.id, channel: 'EMAIL', enabled: true },
      update: { channel: 'EMAIL', enabled: true },
    })

    await prisma.notificationRule.upsert({
      where: { userId_eventType: { userId: user.id, eventType: 'TRADE_EXECUTED' } },
      create: { userId: user.id, eventType: 'TRADE_EXECUTED', enabled: true },
      update: { enabled: true },
    })

    for (let i = 0; i < 5; i++) {
      const txId = uuidv5(`${user.id}:${i}`, SEED_NAMESPACE)
      const symbol = SEED_SYMBOLS[i % SEED_SYMBOLS.length] ?? 'AAPL'
      const type = i % 2 === 0 ? 'BUY' : 'SELL'
      const qty = (i + 1).toString()
      const price = ((i + 1) * 100).toString()

      await prisma.transaction.upsert({
        where: { id: txId },
        create: { id: txId, userId: user.id, symbol, type, qty, price },
        update: { symbol, type, qty, price },
      })
    }
  }

  console.log('[portfolio:seed] OK — 3 prefs, 3 rules, 15 transactions upserted')
}

main()
  .catch((err) => {
    console.error('[portfolio:seed] FAILED', err)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
