# Acumen — Claude Code Project Guide

Portfolio activity + notification microservices. NestJS/Fastify, RabbitMQ, Postgres (schema-per-service), Redis. pnpm monorepo, TypeScript strict.

## Layout

```
apps/
  api-gateway/   REST + JWT issuer. RPC client over RMQ. Owns gateway schema (users).
  portfolio/    Owns transactions/preferences/rules. Publishes transaction.created.
  notification/ Consumes transaction.created. Applies prefs/rules. Pino-log delivery.
packages/
  shared/       Logger, env zod schemas, RMQ helpers, types.
docker/         compose files, postgres-init.sql, rabbitmq definitions.json.
prisma/         (per-app under apps/*/prisma — not root).
scripts/        user-journey.mjs (e2e smoke).
postman/        Newman collection + env.
```

## Stack constraints

- Node `>=22 <23`. pnpm `>=10`. Package manager pinned `pnpm@10.33.0`.
- TS strict, `noUncheckedIndexedAccess`, NodeNext modules, ES2022.
- **Dev runtime = `nest build --builder swc` + `concurrently` + `node --watch dist/main.js`** (NOT `tsx watch`). Each app keeps a `nest-cli.json` (builder=swc, typeCheck=false) and a `.swcrc` with `jsc.transform.legacyDecorator=true` and `jsc.transform.decoratorMetadata=true`. Vitest configs use `unplugin-swc` with the same metadata flags AND `swcrc:false` so the build-side `.swcrc.exclude` does not hide test files.
- Lint/format = Biome only. No ESLint/Prettier.
- Tests = Vitest + Testcontainers (real Postgres + real RMQ). No infra mocks.
- Validation: `class-validator` at controllers, `zod` at RPC message handlers + env.
- Logging: `createLogger(name)` from `@acumen/shared`. Redact `authorization,password,email,token,phone,passwordHash`. Tags: `API_*`, `FEATURE_*`, `ERROR_*`.
- JWT HS256. `JWT_SECRET` min 32 chars. Gateway is sole issuer. `userId` propagates via RPC payload — downstream services never re-decode token.

## Commands

```bash
pnpm install
pnpm dev:setup               # = compose:up:infra + prisma:migrate + seed (one shot, idempotent)
pnpm compose:up:infra        # postgres + rabbitmq + redis
pnpm prisma:migrate          # deploy migrations all 3 apps
pnpm seed                    # seed all 3 apps
pnpm dev                     # gateway + portfolio + notification (concurrently)
pnpm build                   # pnpm -r build (nest build --builder swc per app)
pnpm lint                    # biome check
pnpm lint:fix
pnpm test:integration        # per-app integration tests
pnpm journey                 # scripts/user-journey.mjs e2e
pnpm postman                 # newman collection
pnpm compose:down            # tear down with -v
```

Per-app filter: `pnpm --filter @acumen/<app> <script>`.

## Architecture rules

- RMQ is the only inter-service transport. No direct HTTP between services.
- DLX + retry queue handle backoff. `MAX_RETRIES=3` checked via `x-death`. Terminal queue `notification.transaction.created.dlq-final` — alert key `ERROR_NOTIFICATION_DLQ_FINAL`.
- Consumers use manual ack + bounded prefetch (default 10).
- Cache: `tx:list:{userId}` 30s TTL, invalidated on write. Prefs/rules in notification 60s TTL.
- Single Postgres, schemas: `gateway`, `portfolio`, `notification`. Per-app `DATABASE_URL_*`. Each app owns its `prisma/schema.prisma` + migrations.
- RMQ topology source-of-truth = `docker/rabbitmq/definitions.json`.

## When editing

- Cross-service changes: update RPC payload schema in `@acumen/shared` types AND zod validator on handler side.
- New env var: add to zod schema in `packages/shared/src/env/index.ts` + `.env.example`.
- New migration: `pnpm --filter @acumen/<app> exec prisma migrate dev --name <x>` then update seed if needed.
- New queue/exchange: update `docker/rabbitmq/definitions.json`. Don't declare topology ad-hoc in code.
- Don't add ESLint/Prettier/Turbo/Nx. Don't add BullMQ. Don't add second queue system.

## Verification before claiming done

- `pnpm lint` clean.
- `pnpm build` clean.
- Touched app: `pnpm --filter @acumen/<app> test:integration` green.
- e2e change: `pnpm journey` or `pnpm postman` green with infra up.

## Gotchas

- Devcontainer pins Node 22 + pnpm 10 + docker-cli. Host mismatch = use devcontainer. **Node 25 silently breaks the runtime — keep `.nvmrc` honored.**
- **Never revert dev scripts back to `tsx watch`.** `tsx` (esbuild) does NOT emit `Reflect.metadata("design:paramtypes",…)` → NestJS DI receives `undefined` for every injected service → `@RabbitRPC` handlers throw `Cannot read properties of undefined`, gateway returns `503 RPC_TIMEOUT`, and messages NACK in an infinite DLX retry loop. Vitest passes anyway because its swc plugin emits the metadata, so unit/integration green ≠ live works.
- Gateway `/healthz` returns `status: "ok"` only when **all four** checks pass: `db`, `rmq`, `portfolio_rpc`, `notification_rpc`. Anything else returns `status: "degraded"` with a `details` object naming the per-check cause (`rpc_timeout — downstream not ready or no consumer bound to <routingKey>` etc.). Always read `details` first, don't grep for "Internal server error".
- `compose:down` uses `-v` — wipes volumes. Use `compose:dev:down` for infra-only stack.
- `seed` + `prisma:migrate` run with `--workspace-concurrency=1` because Prisma migrate locks.
- Logger redact list is centralized — don't inline new redact rules.
- JWT secret < 32 chars fails zod boot — not runtime.
- Host ports are deliberately remapped to avoid collisions with native services: postgres `55432`, rabbitmq amqp `5673` mgmt `15673`, redis `6380`. If `lsof -i:55432` shows your local Postgres, stop it before `pnpm compose:up:infra`.
