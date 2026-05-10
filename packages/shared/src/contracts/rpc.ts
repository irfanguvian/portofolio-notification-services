export const RPC_ERROR_CODES = {
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  BAD_REQUEST: 'BAD_REQUEST',
  RPC_TIMEOUT: 'RPC_TIMEOUT',
  INTERNAL: 'INTERNAL',
} as const

export type RpcErrorCode = (typeof RPC_ERROR_CODES)[keyof typeof RPC_ERROR_CODES]

export interface RpcOk<T> {
  ok: true
  data: T
}

export interface RpcErr {
  ok: false
  error: {
    code: RpcErrorCode | string
    message: string
    details?: unknown
  }
}

export type RpcEnvelope<T> = RpcOk<T> | RpcErr

export function ok<T>(data: T): RpcOk<T> {
  return { ok: true, data }
}

export function fail(code: RpcErrorCode | string, message: string, details?: unknown): RpcErr {
  return { ok: false, error: { code, message, details } }
}

export function isRpcEnvelope(value: unknown): value is RpcEnvelope<unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false
  const v = value as Record<string, unknown>
  if (v.ok === true) return 'data' in v
  if (v.ok === false) return typeof v.error === 'object' && v.error !== null
  return false
}
