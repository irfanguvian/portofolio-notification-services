# syntax=docker/dockerfile:1.7
ARG NODE_VERSION=22-alpine

FROM node:${NODE_VERSION} AS base
RUN apk add --no-cache libc6-compat openssl
RUN corepack enable && corepack prepare pnpm@10.33.0 --activate
WORKDIR /workspace

FROM base AS deps
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/notification/package.json apps/notification/
RUN pnpm install --frozen-lockfile --filter @acumen/notification... --filter @acumen/shared

FROM deps AS build
COPY tsconfig.base.json biome.json ./
COPY packages/shared packages/shared
COPY apps/notification apps/notification
RUN pnpm --filter @acumen/shared build \
  && pnpm --filter @acumen/notification exec prisma generate \
  && pnpm --filter @acumen/notification build

FROM base AS runtime
ENV NODE_ENV=production
COPY --from=build /workspace/node_modules /workspace/node_modules
COPY --from=build /workspace/packages/shared /workspace/packages/shared
COPY --from=build /workspace/apps/notification /workspace/apps/notification
WORKDIR /workspace/apps/notification
EXPOSE 3002
CMD ["node", "dist/main.js"]
