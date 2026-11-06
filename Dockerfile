# syntax=docker/dockerfile:1.7

FROM node:26.13.0-trixie-slim@sha256:5adad64f9a1fca2d51972caa65983634c8a774eb300d72b20f7f2a0f60368072 AS base
ENV PNPM_HOME="/pnpm"
ENV NEXT_TELEMETRY_DISABLED=1
ENV PATH="$PNPM_HOME:$PATH"
RUN npm pack --ignore-scripts --pack-destination /tmp pnpm@10.34.8 \
    && node -e 'const fs=require("node:fs"); const crypto=require("node:crypto"); if ("sha512-"+crypto.createHash("sha512").update(fs.readFileSync("/tmp/pnpm-10.34.8.tgz")).digest("base64")!=="sha512-9ieo6XE0Ov5J39D2PQKCNCAd+oMdXLWIcz4eX42ya/FpiaMhYatcG02zsf28NzFgYGtbieAC323RmoWt+R/FqA==") throw new Error("pnpm archive integrity mismatch");' \
    && npm install --global --ignore-scripts --no-audit --no-fund /tmp/pnpm-10.34.8.tgz \
    && test "$(pnpm --version)" = "10.34.8" \
    && rm /tmp/pnpm-10.34.8.tgz
WORKDIR /app

# Install dependencies in a separate layer with manifests, lockfile and patches.
# Cache it until one of those dependency inputs changes.
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY patches ./patches
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
FROM node:26.13.0-trixie-slim@sha256:5adad64f9a1fca2d51972caa65983634c8a774eb300d72b20f7f2a0f60368072 AS runner
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV HOSTNAME=0.0.0.0
ENV PORT=3000
# Tune V8 memory for typical 512 MB–1 GB container
ENV NODE_OPTIONS="--max-old-space-size=384"
WORKDIR /app

# Remove unused APT from the standalone runner through dpkg; retain its package database.
# Run as non-root for security
RUN groupadd --gid 1001 appgroup && useradd --uid 1001 --gid appgroup --shell /bin/false appuser \
    && dpkg --purge apt libapt-pkg7.0 \
    && test -z "$(dpkg --audit)" \
    && rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack /opt/yarn-* \
    && rm -f /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack /usr/local/bin/yarn /usr/local/bin/yarnpkg

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
