import { z } from 'zod'

export const PreferenceChannelSchema = z.enum(['EMAIL', 'SMS', 'PUSH'])
export type PreferenceChannel = z.infer<typeof PreferenceChannelSchema>

export const PreferenceSetCommandSchema = z.object({
  userId: z.string().uuid(),
  channel: PreferenceChannelSchema,
  enabled: z.boolean(),
})
export type PreferenceSetCommand = z.infer<typeof PreferenceSetCommandSchema>

export const PreferenceGetCommandSchema = z.object({
  userId: z.string().uuid(),
})
export type PreferenceGetCommand = z.infer<typeof PreferenceGetCommandSchema>

export const PreferenceRecordSchema = z.object({
  userId: z.string().uuid(),
  channel: PreferenceChannelSchema,
  enabled: z.boolean(),
})
export type PreferenceRecord = z.infer<typeof PreferenceRecordSchema>
