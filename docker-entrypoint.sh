#!/bin/sh
set -e

echo "=== Syncing database schema ==="
npx prisma db push --skip-generate --accept-data-loss 2>&1 || {
  echo "WARNING: prisma db push failed, attempting to start anyway..."
}

echo "=== Starting application ==="
exec node server.js
