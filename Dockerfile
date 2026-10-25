# syntax=docker/dockerfile:1.7

FROM node:24.22.1-bookworm-slim AS base
ENV PNPM_HOME="/pnpm"
ENV NEXT_TELEMETRY_DISABLED=1
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
# Bound each compiler heap; workers and native buffers need additional memory.
ARG NODE_BUILD_MAX_OLD_SPACE_MB=2560
COPY . .
RUN NODE_OPTIONS="--max-old-space-size=${NODE_BUILD_MAX_OLD_SPACE_MB}" pnpm --filter @tax-engine/web build

# Production runner
FROM node:24.22.1-bookworm-slim AS runner
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
COPY --from=builder --chown=appuser:appgroup /app/apps/web/public ./apps/web/public
COPY --from=builder --chown=appuser:appgroup /app/forms/blank ./forms/blank
USER appuser
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || '3000') + '/api/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"
CMD ["node", "apps/web/server.js"]
