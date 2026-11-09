#!/bin/sh
set -eu
cd /app
: "${DATABASE_URL:?Configure DATABASE_URL}"
: "${FRONTEND_ORIGIN:?Configure FRONTEND_ORIGIN con https://su-dominio}"
node backend/dist/check-production.js
pnpm db:migrate
pnpm db:seed
exec node backend/dist/server.js
