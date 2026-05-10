export const EXCHANGES = {
  PORTFOLIO_EVENTS: 'portfolio.events',
  PORTFOLIO_EVENTS_DLX: 'portfolio.events.dlx',
} as const

export const QUEUES = {
  PORTFOLIO_COMMANDS: 'portfolio.commands',
  NOTIFICATION_COMMANDS: 'notification.commands',
  NOTIFICATION_TX_CREATED: 'notification.transaction.created',
  NOTIFICATION_TX_CREATED_RETRY: 'notification.transaction.created.retry',
  NOTIFICATION_TX_CREATED_DLQ_FINAL: 'notification.transaction.created.dlq-final',
} as const

export const ROUTING_KEYS = {
  TRANSACTION_CREATED: 'transaction.created',
  TRANSACTION_CREATED_RETRY: 'transaction.created.retry',
} as const

export const MESSAGE_PATTERNS = {
  TX_CREATE: 'portfolio.tx.create',
  TX_LIST: 'portfolio.tx.list',
  PREFS_SET: 'portfolio.prefs.set',
  PREFS_GET: 'portfolio.prefs.get',
  RULES_SET: 'portfolio.rules.set',
  RULES_GET: 'portfolio.rules.get',
  NOTIFICATIONS_LIST: 'notification.list',
  HEALTH_PING_PORTFOLIO: 'portfolio.health.ping',
  HEALTH_PING_NOTIFICATION: 'notification.health.ping',
} as const

export const RETRY_TTL_MS = 5000
export const MAX_RETRIES = 3

export const MESSAGE_PATTERN_HEADER = 'x-message-pattern'

export type ExchangeName = (typeof EXCHANGES)[keyof typeof EXCHANGES]
export type QueueName = (typeof QUEUES)[keyof typeof QUEUES]
export type RoutingKey = (typeof ROUTING_KEYS)[keyof typeof ROUTING_KEYS]
export type MessagePattern = (typeof MESSAGE_PATTERNS)[keyof typeof MESSAGE_PATTERNS]
