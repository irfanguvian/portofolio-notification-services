#!/usr/bin/env bash
set -euo pipefail

echo '[devcontainer] installing pnpm dependencies...'
pnpm install --frozen-lockfile

echo '[devcontainer] generating prisma clients (best effort)...'
pnpm -r exec prisma generate || true

echo '[devcontainer] ready. Infra services already up via compose.'
