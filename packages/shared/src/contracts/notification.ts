import { z } from 'zod'
import { PreferenceChannelSchema } from './preference.js'
import { NotificationEventTypeSchema } from './rule.js'

export const NotificationStatusSchema = z.enum(['PENDING', 'SENT', 'FAILED', 'DEAD'])
export type NotificationStatus = z.infer<typeof NotificationStatusSchema>

export const NotificationRecordSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  eventType: NotificationEventTypeSchema,
  channel: PreferenceChannelSchema,
  payload: z.record(z.unknown()),
  status: NotificationStatusSchema,
  attempts: z.number().int().nonnegative(),
  createdAt: z.string().datetime(),
})
export type NotificationRecord = z.infer<typeof NotificationRecordSchema>

export const NotificationListCommandSchema = z.object({
  userId: z.string().uuid(),
})
export type NotificationListCommand = z.infer<typeof NotificationListCommandSchema>
