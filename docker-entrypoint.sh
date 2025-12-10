#!/bin/sh
set -e

echo "Running database migrations..."
node ./node_modules/prisma/build/index.js db push --skip-generate --accept-data-loss

echo "Starting application..."
exec node server.js