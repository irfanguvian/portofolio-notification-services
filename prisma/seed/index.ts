export const SEED_USERS = [
  {
    id: '00000000-0000-0000-0000-000000000001',
    email: 'alice@seed.local',
    password: 'Passw0rd!',
  },
  {
    id: '00000000-0000-0000-0000-000000000002',
    email: 'bob@seed.local',
    password: 'Passw0rd!',
  },
  {
    id: '00000000-0000-0000-0000-000000000003',
    email: 'carol@seed.local',
    password: 'Passw0rd!',
  },
] as const

export type SeedUser = (typeof SEED_USERS)[number]

export const SEED_SYMBOLS = ['AAPL', 'MSFT', 'NVDA', 'AMZN', 'TSLA'] as const
export type SeedSymbol = (typeof SEED_SYMBOLS)[number]

export const SEED_TX_PER_USER = 5

export const SEED_NAMESPACE = '5b8fbc4a-79ad-4c2b-9c6f-2f8d8e8a0001'
