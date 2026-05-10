# Acumen — User Journey & Local Run Guide

This document is the canonical step-by-step API tour. The **same ordering** is enforced by:

- `scripts/user-journey.mjs` (run with `pnpm journey`)
- `postman/Acumen.postman_collection.json` (run with `pnpm postman`)
- The integration test suites in `apps/*/test/integration/`

If you're new to this repo, follow §1 once, then walk §2 in Postman or `pnpm journey` to see the system end-to-end.

---

## 1. Run locally

### Prerequisites

- Node 22 LTS, pnpm ≥ 10, Docker.
- `cp .env.example .env` (no edits required for default ports).

### First-run sequence (cold checkout)

```bash
pnpm install --frozen-lockfile     # 1. install deps
pnpm dev:setup                     # 2. compose:up:infra + prisma:migrate + seed (one shot)
pnpm dev                           # 3. boot the 3 services concurrently

# In a second terminal, after the gateway logs "Nest application successfully started":
pnpm journey                       # 4. fetch-based per-API simulation, exits 0 on success
pnpm postman                       # 5. Newman run of the same flow
```

`pnpm dev:setup` is equivalent to:

```bash
pnpm compose:up:infra              # postgres + rabbitmq + redis (host ports 55432, 5673, 6380)
pnpm prisma:migrate                # apply migrations to gateway, portfolio, notification schemas
pnpm seed                          # 3 users + prefs + rules + 15 transactions, idempotent
```

To stop everything: `pnpm compose:down` (wipes volumes; use `pnpm compose:dev:down` if you only used the devcontainer infra stack).

### Env loading

Every per-app script (`dev`, `start`, `prisma:generate`, `prisma:migrate`, `prisma db seed`) is wrapped with `dotenv -e ../../.env --`, so the apps work the same whether you launch them via root `pnpm dev` or per-app `pnpm --filter @acumen/<app> dev`. No per-app `.env` is required.

In the Docker images, `node dist/main.js` runs directly and the env comes from `docker/docker-compose.yml > services.<name>.environment` (no `.env` is copied into the image).

---

## 2. Hit these in order — 13 steps

Run each step in this sequence. Authenticated steps (`auth: yes`) require the JWT captured at step 03.

| # | Method | Path | Auth? | Body | Capture | Expected status |
|---|---|---|---|---|---|---|
| 01 | GET  | `/healthz`                 | no  | —                                                   | —                | 200 (`status: ok` once all 3 services are warm; otherwise `status: degraded` with a `details` object naming the failing check) |
| 02 | POST | `/auth/register`           | no  | `{ "email", "password" }`                           | `token`, `userId` | 201 (or 409 if seeded) |
| 03 | POST | `/auth/login`              | no  | `{ "email", "password" }`                           | `token`, `userId` | 200 |
| 04 | POST | `/portfolio/transactions`  | **no** | (any payload)                                    | —                | **401** (negative test) |
| 05 | POST | `/preferences`             | yes | `{ "channel": "NOPE", "enabled": "maybe" }`         | —                | **400** (negative test) |
| 06 | POST | `/preferences`             | yes | `{ "channel": "EMAIL", "enabled": true }`           | —                | 200 |
| 07 | GET  | `/preferences`             | yes | —                                                   | —                | 200 (`channel === 'EMAIL'`, `enabled === true`) |
| 08 | POST | `/rules`                   | yes | `{ "eventType": "TRADE_EXECUTED", "enabled": true }`| —                | 200 |
| 09 | POST | `/portfolio/transactions`  | yes | `{ "symbol", "type", "qty", "price" }`              | `transactionId`  | 201 |
| 10 | POST | `/portfolio/transactions`  | yes | `{ "symbol", "type", "qty", "price" }`              | —                | 201 |
| 11 | POST | `/portfolio/transactions`  | yes | `{ "symbol", "type", "qty", "price" }`              | —                | 201 |
| 12 | GET  | `/portfolio/transactions`  | yes | —                                                   | —                | 200 (array length ≥ 3, includes captured `transactionId`) |
| 13 | GET  | `/notifications`           | yes | — (poll up to 10×500ms)                             | `notificationId` | 200 (array contains `eventType=TRADE_EXECUTED`, `status=SENT`) |

`auth: yes` ⇒ header `Authorization: Bearer {{token}}`. Postman captures variables across requests automatically; the journey script holds them in a per-user `ctx` object.

### Field shapes

**`/auth/register` request**: `{ email: string (RFC5322), password: string (min 8) }`
**`/auth/register` response (201)**: `{ token: string, userId: string (uuid), email: string }`
**`/auth/login` request**: `{ email, password }` (same as register)
**`/auth/login` response (200)**: same shape as register.

**`/portfolio/transactions` POST request**: `{ symbol: string (1..10), type: 'BUY' | 'SELL', qty: number > 0, price: number > 0, idempotencyKey?: string }`
**`/portfolio/transactions` POST response (201)**: `{ id, userId, symbol, type, qty, price, createdAt }`
**`/portfolio/transactions` GET response (200)**: `Array<TransactionRecord>` (newest first).

**`/preferences` POST request**: `{ channel: 'EMAIL' | 'SMS' | 'PUSH', enabled: boolean }`
**`/preferences` POST response (200)**: `{ userId, channel, enabled }`
**`/preferences` GET response (200)**: same shape, or `null` if unset.

**`/rules` POST request**: `{ eventType: 'TRADE_EXECUTED', enabled: boolean }`
**`/rules` POST response (200)**: `{ id, userId, eventType, enabled }`

**`/notifications` GET response (200)**: `Array<{ id, userId, eventType, channel, payload, status, attempts, createdAt }>` (status ∈ `PENDING | SENT | FAILED | DEAD`).

**`/healthz` GET response (200)**: `{ status: 'ok' | 'degraded', checks: { db, rmq, portfolio_rpc, notification_rpc } (each 'up' | 'down'), timestamp, details? }`. `status: 'ok'` only when **all** four checks pass — including a live `health.ping` RPC round-trip to portfolio + notification. When any check is `down`, the response also includes a `details` object whose keys mirror `checks` and whose values are short, actionable strings (e.g. `details.portfolio_rpc = "rpc_timeout — downstream not ready or no consumer bound to portfolio.health.ping"`, `details.db = "gateway.users table missing — run pnpm prisma:migrate"`). Read `details` first; don't try to interpret `degraded` as a generic 5xx.

Expected when all three apps are up:

```json
{
  "status": "ok",
  "checks": { "db": "up", "rmq": "up", "portfolio_rpc": "up", "notification_rpc": "up" },
  "timestamp": "2026-05-10T06:51:31.390Z"
}
```

---

## 3. Troubleshooting

The gateway returns a stable `code` field on errors. Map to root cause:

| HTTP | `code` | Meaning | Likely cause |
|---|---|---|---|
| 400 | `VALIDATION_ERROR` | Request body or RPC payload failed schema validation. | Bad client payload (e.g. `qty: -1`, `channel: 'NOPE'`). Check the response `details` for the failing zod path. |
| 401 | (HttpException) | JWT missing/invalid/expired. | No `Authorization` header, or token signed with a different `JWT_SECRET`. |
| 403 | `FORBIDDEN` | Authenticated but not permitted. | Reserved for future role checks. |
| 404 | `NOT_FOUND` | Resource not found. | Wrong id. |
| 409 | `CONFLICT` | Duplicate. | Re-registering an existing user — safe to ignore in idempotent flows. |
| 503 | `RPC_TIMEOUT` | A downstream service didn't reply within `RPC_TIMEOUT_MS`. | `pnpm dev` only just started; portfolio or notification hasn't bound its RPC queues yet. Wait for `/healthz` to report `status: 'ok'`, then retry. |
| 503 | `RPC_TRANSPORT_ERROR` | Could not reach RabbitMQ at all. | Infra not up — run `pnpm compose:up:infra`. |
| 500 | (no `code`) | Unhandled exception. | Migrations not applied (`pnpm prisma:migrate`); DB schema missing. Re-run `pnpm dev:setup`. |

If you see "EnvValidationError" on boot, the app could not load `.env`. Confirm `.env` exists at the repo root (it is `.gitignore`d on purpose); fall back to `cp .env.example .env`.

---

## 4. Common pitfalls

- **Use Node 22.** The repo's `.nvmrc` pins `22`. Newer Node (e.g. 25.x) silently breaks the SWC-emitted decorator metadata path used by NestJS DI; the apps boot but `@RabbitRPC` handlers receive `undefined` for every injected service. If `node --version` is not `v22.x`, run `nvm use` before anything else.
- **If `/healthz` reports any check `down`, read the `details` field.** It names the actionable cause per check (`rpc_timeout`, `gateway.users table missing — run pnpm prisma:migrate`, `AMQP channel not connected`, etc.). Don't restart blindly.
- **Don't run `pnpm compose:up` unless you also want the Dockerfile-built apps.** For local development use `pnpm compose:up:infra` (postgres + rabbitmq + redis only) and run the apps with `pnpm dev`.
- **First-cold-boot RPC race.** Gateway may briefly show `portfolio_rpc: "down"` for ~1s while the downstream services finish binding their RabbitMQ queues. Re-poll `/healthz` until `status: "ok"` before running the journey script.

## 5. References

- Recruiter run guide: `docs/explain-repo.md`
- Plan: `.omc/plans/codebase-review-fix-and-extend.md`
- Gateway DI fix plan: `.omc/plans/gateway-healthz-fix.md`
- Original system plan: `.omc/plans/portfolio-activity-notification-system.md`
- Project conventions: `CLAUDE.md`
