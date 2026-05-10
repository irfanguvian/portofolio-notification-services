# @acumen/shared

Shared building blocks for the Acumen portfolio + notification microservices.

## Exports

- `@acumen/shared/constants` — RabbitMQ exchange / queue / routing-key / message-pattern constants and retry tunables.
- `@acumen/shared/contracts` — zod schemas + inferred TS types for inter-service messages and events.
- `@acumen/shared/logger` — `createLogger(serviceName)` returning a pino instance with PII redaction baked in.
- `@acumen/shared/env` — `loadEnv(zodSchema)` helper that parses `process.env` with friendly error reporting.

## RabbitMQ library choice

All services use [`@golevelup/nestjs-rabbitmq`](https://github.com/golevelup/nestjs-rabbitmq) (v5+) for RMQ
messaging instead of `@nestjs/microservices`'s built-in RMQ transport. Reasons:

- First-class declarative DLX / retry-queue topology (TTL'd retry queue + dead-letter routing) that maps
  cleanly onto our `notification.transaction.created.retry` + `.dlq-final` setup.
- Explicit subscribe handlers on arbitrary queues (vs. one queue per service in `@nestjs/microservices`),
  so we can model both per-service command queues (`portfolio.commands`, `notification.commands`) and
  domain event queues from the same bootstrap.
- Manual ack control with `Nack(requeue=false)` to push poison messages straight to DLX without retry
  amplification, which is awkward with `@nestjs/microservices` RMQ.

The API gateway uses `AmqpConnection.request(...)` for request/reply RPC against the per-service command
queues, with the message pattern carried in headers.
