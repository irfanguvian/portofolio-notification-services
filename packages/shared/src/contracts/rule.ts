import { z } from 'zod'

export const NotificationEventTypeSchema = z.enum(['TRADE_EXECUTED'])
export type NotificationEventType = z.infer<typeof NotificationEventTypeSchema>

export const RuleSetCommandSchema = z.object({
  userId: z.string().uuid(),
  eventType: NotificationEventTypeSchema,
  enabled: z.boolean(),
})
export type RuleSetCommand = z.infer<typeof RuleSetCommandSchema>

export const RuleGetCommandSchema = z.object({
  userId: z.string().uuid(),
})
export type RuleGetCommand = z.infer<typeof RuleGetCommandSchema>

export const RuleRecordSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  eventType: NotificationEventTypeSchema,
  enabled: z.boolean(),
})
export type RuleRecord = z.infer<typeof RuleRecordSchema>
