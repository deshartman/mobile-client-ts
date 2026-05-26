# syntax=docker/dockerfile:1.7

# ───── Stage 1: deps ─────
# Install all workspace deps. Keeps deps layer cacheable across code-only
# changes because we copy only package manifests here.
FROM node:22-alpine AS deps
RUN apk add --no-cache libc6-compat python3 make g++ sqlite
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

# Copy manifests first. Any code change below this layer won't bust deps.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json ./apps/web/
COPY packages/shared-types/package.json ./packages/shared-types/
COPY packages/db/package.json ./packages/db/

RUN pnpm install --frozen-lockfile


# ───── Stage 2: builder ─────
# Bring in source, build Next's standalone output. The standalone bundle is
# self-contained under apps/web/.next/standalone and gets copied to the
# runner stage without node_modules.
FROM node:22-alpine AS builder
RUN apk add --no-cache libc6-compat python3 make g++
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/web/node_modules ./apps/web/node_modules
COPY --from=deps /app/packages/shared-types/node_modules ./packages/shared-types/node_modules
COPY --from=deps /app/packages/db/node_modules ./packages/db/node_modules

COPY . .

ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm --filter web build


# ───── Stage 3: runner ─────
# Minimal image. Just node + sqlite3 + the standalone bundle.
FROM node:22-alpine AS runner
RUN apk add --no-cache sqlite
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Next's standalone output includes its own minimal node_modules + server.js.
COPY --from=builder /app/apps/web/.next/standalone ./
COPY --from=builder /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder /app/apps/web/public ./apps/web/public

# Fly mounts the data volume at /data — we set DB_PATH in fly.toml to match.
RUN mkdir -p /data

EXPOSE 3000

# The standalone server lives at apps/web/server.js due to the monorepo shape.
CMD ["node", "apps/web/server.js"]
