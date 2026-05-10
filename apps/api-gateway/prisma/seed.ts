import bcrypt from 'bcryptjs'
import { PrismaClient } from '../node_modules/.prisma/client-gateway/index.js'
import { SEED_USERS } from './seed/index.js'

const prisma = new PrismaClient()

async function main(): Promise<void> {
  for (const u of SEED_USERS) {
    const passwordHash = await bcrypt.hash(u.password, 10)
    await prisma.user.upsert({
      where: { id: u.id },
      create: { id: u.id, email: u.email, passwordHash },
      update: { email: u.email, passwordHash },
    })
  }
  console.log(`[gateway:seed] OK — ${SEED_USERS.length} users upserted`)
}

main()
  .catch((err) => {
    console.error('[gateway:seed] FAILED', err)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
