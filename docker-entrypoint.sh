#!/bin/sh
set -e

echo "[Entrypoint] Running Prisma migrations..."
npx prisma migrate deploy

echo "[Entrypoint] Starting SDR server..."
exec node dist/index.js