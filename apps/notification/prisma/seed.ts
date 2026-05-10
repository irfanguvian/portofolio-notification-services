import { PrismaClient } from '@prisma/client'

const SEED_USER_IDS = [
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000002',
  '00000000-0000-0000-0000-000000000003',
] as const

const SAMPLE_NOTIFICATION_IDS = [
  '11111111-1111-1111-1111-000000000001',
  '11111111-1111-1111-1111-000000000002',
  '11111111-1111-1111-1111-000000000003',
] as const

async function main() {
  const prisma = new PrismaClient()
  try {
    if (process.env.SEED_FIXTURES === '1') {
      for (let i = 0; i < SEED_USER_IDS.length; i++) {
        await prisma.notification.upsert({
          where: { id: SAMPLE_NOTIFICATION_IDS[i] },
          create: {
            id: SAMPLE_NOTIFICATION_IDS[i],
            userId: SEED_USER_IDS[i],
            eventType: 'TRADE_EXECUTED',
            channel: 'EMAIL',
            payload: { sample: true, index: i },
            status: 'SENT',
            attempts: 1,
          },
          update: {},
        })
      }
      console.log('[notification:seed] inserted SEED_FIXTURES sample rows')
    } else {
      console.log('[notification:seed] no rows by default; set SEED_FIXTURES=1 to insert samples')
    }
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
