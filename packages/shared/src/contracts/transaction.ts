import { z } from 'zod'

export const TransactionTypeSchema = z.enum(['BUY', 'SELL'])
export type TransactionType = z.infer<typeof TransactionTypeSchema>

export const TransactionCreatedEventSchema = z.object({
  transactionId: z.string().uuid(),
  userId: z.string().uuid(),
  symbol: z.string().min(1).max(10),
  type: TransactionTypeSchema,
  qty: z.number().positive(),
  price: z.number().positive(),
  occurredAt: z.string().datetime(),
})
export type TransactionCreatedEvent = z.infer<typeof TransactionCreatedEventSchema>

export const TransactionCreateCommandSchema = z.object({
  userId: z.string().uuid(),
  symbol: z.string().min(1).max(10),
  type: TransactionTypeSchema,
  qty: z.number().positive(),
  price: z.number().positive(),
  idempotencyKey: z.string().optional(),
})
export type TransactionCreateCommand = z.infer<typeof TransactionCreateCommandSchema>

export const TransactionListCommandSchema = z.object({
  userId: z.string().uuid(),
})
export type TransactionListCommand = z.infer<typeof TransactionListCommandSchema>

export const TransactionRecordSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  symbol: z.string(),
  type: TransactionTypeSchema,
  qty: z.number(),
  price: z.number(),
  createdAt: z.string().datetime(),
})
export type TransactionRecord = z.infer<typeof TransactionRecordSchema>
