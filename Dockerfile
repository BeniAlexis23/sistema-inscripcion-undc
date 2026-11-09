FROM node:24-bookworm-slim AS build
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates python3 make g++ && rm -rf /var/lib/apt/lists/*
RUN corepack enable && corepack prepare pnpm@11.25.0 --activate
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY backend/package.json backend/package.json
COPY frontend/package.json frontend/package.json
COPY backend/prisma backend/prisma
RUN pnpm install --frozen-lockfile
COPY backend backend
COPY frontend frontend
RUN pnpm db:generate && pnpm build

FROM node:24-bookworm-slim AS runtime
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
ENV NODE_ENV=production
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
RUN corepack enable && corepack prepare pnpm@11.25.0 --activate
WORKDIR /app
# Keep Prisma CLI and tsx for migrations, seed and the local admin command.
COPY --from=build --chown=node:node /app /app
COPY --chmod=755 deploy/start.sh /usr/local/bin/undc-start
RUN mkdir -p /app/backend/storage && chown node:node /app/backend/storage
USER node
EXPOSE 4000
CMD ["undc-start"]
