#!/bin/sh
set -eu
cd /app
: "${DATABASE_URL:?Configure DATABASE_URL}"
: "${FRONTEND_ORIGIN:?Configure FRONTEND_ORIGIN con https://su-dominio}"
node -e 'const u = new URL(process.env.FRONTEND_ORIGIN); if (u.protocol !== "https:" || u.origin !== process.env.FRONTEND_ORIGIN) throw new Error("FRONTEND_ORIGIN debe ser un origen HTTPS sin barra final ni ruta");'
pnpm db:migrate
pnpm db:seed
exec node backend/dist/server.js
