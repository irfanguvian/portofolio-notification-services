import type { z } from 'zod'

export class EnvValidationError extends Error {
  constructor(
    message: string,
    public readonly issues: z.ZodIssue[],
  ) {
    super(message)
    this.name = 'EnvValidationError'
  }
}

export function loadEnv<S extends z.ZodTypeAny>(
  schema: S,
  source: NodeJS.ProcessEnv | Record<string, unknown> = process.env,
): z.infer<S> {
  const parsed = schema.safeParse(source)
  if (parsed.success) {
    return parsed.data
  }

  const issues = parsed.error.issues
  const formatted = issues
    .map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`)
    .join('\n')
  const msg = `Environment validation failed:\n${formatted}`
  throw new EnvValidationError(msg, issues)
}
