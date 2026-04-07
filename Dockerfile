# syntax=docker/dockerfile:1.7

FROM node:22-bookworm-slim AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable
WORKDIR /app

# Install dependencies in a separate layer — only package manifests and lockfile
# so this layer is cached unless dependencies actually change.
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json apps/web/package.json
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/engine/package.json packages/engine/package.json
RUN pnpm install --frozen-lockfile

FROM deps AS builder
COPY . .
RUN pnpm --filter @tax-engine/web build

# Production runner
FROM node:22-bookworm-slim AS runner
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV HOSTNAME=0.0.0.0
ENV PORT=3000
# Tune V8 memory for typical 512 MB–1 GB container
ENV NODE_OPTIONS="--max-old-space-size=384"
WORKDIR /app

# Run as non-root for security
RUN groupadd --gid 1001 appgroup && useradd --uid 1001 --gid appgroup --shell /bin/false appuser

# Copy standalone server (includes bundled node_modules)
COPY --from=builder --chown=appuser:appgroup /app/apps/web/.next/standalone ./
# Copy static assets the standalone build references but doesn't bundle
COPY --from=builder --chown=appuser:appgroup /app/apps/web/.next/static ./apps/web/.next/static
USER appuser
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
