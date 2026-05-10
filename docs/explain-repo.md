# Acumen — Repository Walkthrough

A short, recruiter-facing tour of this codebase. Read top-to-bottom, copy-paste the commands, and you'll have the full system running in about 5 minutes.

---

## 1. What this repository is

A small backend system, three services on a `pnpm` monorepo:

- **api-gateway** — REST + JWT facade. Issues tokens, fans out RPC calls over RabbitMQ.
- **portfolio** — Owns transactions, preferences, rules. Publishes `transaction.created` events.
- **notification** — Consumes `transaction.created`, applies user prefs/rules, persists notifications, "delivers" via pino log.

Stack: NestJS + Fastify, RabbitMQ (RPC + DLX retry), Postgres (schema-per-service), Redis (cache + idempotency), TypeScript strict, Vitest + Testcontainers, Biome. No ESLint, no Prettier, no second queue system.

End-to-end behaviour is exercised by:
- `scripts/user-journey.mjs` (`pnpm journey`) — sequential `fetch`-based simulation across all 13 public endpoints, three users.
- `postman/Acumen.postman_collection.json` (`pnpm postman`) — same flow, runnable headlessly via Newman.
- Per-service Vitest integration suites — real Postgres + real RabbitMQ via Testcontainers.

---

## 2. Run from zero

Tested on macOS 14 + Linux. Windows: use the devcontainer.

### 2.1 Prerequisites

- **Node 22 LTS** (the `.nvmrc` pins `22`; do not use Node 25 — it silently breaks NestJS DI through the SWC builder).
- **pnpm 10** — `corepack enable` activates the version pinned in `package.json`.
- **Docker + Docker Compose v2** — needed for Postgres, RabbitMQ, Redis containers.

```bash
node --version    # expect v22.x
corepack enable
pnpm --version    # expect 10.x
docker info       # daemon must be running
```

### 2.2 Clone, install, boot infrastructure

```bash
git clone <this-repo-url> acumen
cd acumen
cp .env.example .env                 # no edits required
pnpm install --frozen-lockfile       # ~30s on warm pnpm store
pnpm dev:setup                       # compose:up:infra + prisma:migrate + seed (idempotent)
```

`pnpm dev:setup` brings up three containers and seeds the database:

| Container | Host port | Purpose |
|---|---|---|
| `acumen-postgres` | `55432` | One Postgres with three schemas: `gateway`, `portfolio`, `notification` |
| `acumen-rabbitmq` | `5673` (amqp), `15673` (mgmt UI) | Message broker — exchanges + queues are preloaded from `docker/rabbitmq/definitions.json` |
| `acumen-redis` | `6380` | Read-cache + idempotency |

Host ports are remapped (55432 / 5673 / 6380) to avoid colliding with native Postgres/RabbitMQ/Redis on 5432/5672/6379.

### 2.3 Run the three services

```bash
pnpm dev
```

Three concurrent processes start. Wait ~10 seconds, then in a second terminal:

```bash
curl -s localhost:3000/healthz | jq
```

Expected response:

```json
{
  "status": "ok",
  "checks": {
    "db": "up",
    "rmq": "up",
    "portfolio_rpc": "up",
    "notification_rpc": "up"
  },
  "timestamp": "2026-05-10T06:51:31.390Z"
}
```

If `status: "degraded"`, look at the `details` field in the response — it names the failing check verbatim.

### 2.4 Run the end-to-end journey

```bash
pnpm journey
```

Expected last lines:

```
=== summary ===
PASS alice@seed.local — 13 steps
PASS bob@seed.local   — 13 steps
PASS carol@seed.local — 13 steps

3/3 users passed
```

Each user walks the same 13-step API tour: health check, register, login, negative auth/validation cases, set preferences + rules, create three transactions, list transactions, poll for the resulting notification.

Optional Postman/Newman run (same flow):

```bash
pnpm postman
```

### 2.5 Tear down

```bash
pnpm compose:down       # stops containers AND wipes volumes
```

Use `pnpm compose:dev:down` only if you brought infra up via the devcontainer's separate `docker-compose.dev.yml` stack (it also wipes its own volumes; there is no "keep data" variant).

---

## 3. What to look at

| Path | What it tells you |
|---|---|
| `README.md` | Architecture diagram + decisions/tradeoffs/scalability notes |
| `docs/USER_JOURNEY.md` | The 13-step API tour, request/response shapes, troubleshooting table |
| `docs/explain-repo.md` | This file |
| `apps/api-gateway/` | REST surface + JWT issuer + RPC client |
| `apps/portfolio/` | Transactions/prefs/rules domain + event publisher |
| `apps/notification/` | Event consumer + DLX retry + pino-log delivery |
| `packages/shared/` | Shared logger, env zod schemas, RPC envelope, queue/exchange constants |
| `docker/rabbitmq/definitions.json` | RabbitMQ topology (single source of truth) |
| `scripts/user-journey.mjs` | Black-box E2E simulator |
| `postman/Acumen.postman_collection.json` | Same flow as Postman collection |

---

## 4. Verifying it works

Three quick checks, in order:

1. **Health** — `curl localhost:3000/healthz` → `{"status":"ok",...}` with all four checks `up`.
2. **Journey** — `pnpm journey` → ends with `3/3 users passed`, exit code 0.
3. **Tests** — `pnpm -r test:integration` → green across api-gateway (13 tests), portfolio (3 tests), notification (3 tests). Total runtime ~60s on a warm Docker.

If any of these fail, see §5.

---

## 5. Troubleshooting (the two real failure modes encountered while building this)

### 5.1 `503 RPC_TIMEOUT` on every authenticated endpoint, plus `Cannot read properties of undefined` flooding the portfolio log

**Cause** — the per-app `dev` script was `tsx watch src/main.ts`. `tsx` is built on esbuild, which does not emit `Reflect.metadata("design:paramtypes",…)`. NestJS DI relies on that metadata to resolve constructor types; without it, every injected service comes through as `undefined`. `@RabbitRPC` handlers then throw the moment they touch `this.service`, the message is NACKed, and the DLX retry queue redelivers it forever. From the gateway side this looks like every RPC call timing out at 8s.

**Fix already applied on this branch** — each app now uses `nest build --builder swc` + `concurrently` + `node --watch dist/main.js` for dev. SWC's `jsc.transform.decoratorMetadata: true` restores the metadata. Vitest configs use `unplugin-swc` with the same flag, so unit + integration tests stay green.

**Symptom check** — if you ever see `Cannot read properties of undefined` in any service log, somebody reverted a per-app `package.json` `dev` script back to `tsx watch`. Don't.

### 5.2 Port collision on 5432 / 5672 / 6379

**Cause** — you probably have Postgres / RabbitMQ / Redis running natively on the standard ports.

**Fix** — this repo deliberately publishes to non-standard host ports (`55432`, `5673`, `15673`, `6380`). If those *also* clash, edit `.env`:

```bash
POSTGRES_HOST_PORT=55433
RABBITMQ_HOST_PORT=5674
RABBITMQ_MGMT_HOST_PORT=15674
REDIS_HOST_PORT=6381
```

then update `DATABASE_URL_*`, `RABBITMQ_URL`, `REDIS_URL` in the same file.

### 5.3 Other quick-check commands

```bash
docker ps --format '{{.Names}}\t{{.Status}}'      # all 3 acumen-* containers should be healthy
lsof -iTCP:3000 -iTCP:3001 -iTCP:3002 -sTCP:LISTEN -P    # gateway / portfolio / notification listeners
curl -sS -u acumen:acumen http://localhost:15673/api/overview | jq .product_version
```

---

## 6. What's intentionally out of scope

- Real email / SMS / push delivery (notifications "deliver" via pino log).
- Live market data, P&L, holdings aggregation.
- Frontend / UI.
- Rate limiting, multi-tenant model, distributed tracing.

These are flagged in `README.md §8` and exist as future work.

---

If anything in this guide doesn't behave as described, the troubleshooting tables in `README.md §7` and `docs/USER_JOURNEY.md §3` are more exhaustive.
