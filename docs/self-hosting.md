# Self-Hosting

The current self-host target is a single `docker compose` stack for the monorepo.

The image uses Node 24.22.1 and includes public assets and blank PDF templates.
`/api/health` reports process liveness; it does not certify database health,
tax-law completeness, or filing readiness. CI builds the runtime image, smoke
tests it without AI credentials, and produces a CycloneDX SBOM for that image.
Local container checks require Docker or Podman. For Docker, run
`docker build -t tax-engine:ci .` then
`node scripts/smoke-container.mjs tax-engine:ci`. For Podman, build the same
Dockerfile and set `TAX_ENGINE_CONTAINER_RUNTIME=podman` for the smoke script.
A build VM needs free memory in addition to other services. The compiler old-space heap
is bounded by `NODE_BUILD_MAX_OLD_SPACE_MB` (default 2560); change it with
`--build-arg` when needed. Type checking stays enabled. Runtime old-space remains
separately capped at 384 MB; young-generation and native memory are additional.
That setting is not a measured production capacity claim.

## What this stack does

- boots the Next.js app from `apps/web`
- provisions a local Postgres service so hosted-mode persistence adapters can be exercised locally
- keeps the current workspace local-first, with return drafts and upload metadata stored in browser storage
- works without any hosted dependency

For deterministic local operation, leave `MODEL_PROVIDER_API_KEY`,
`OPENAI_API_KEY`, `GEMINI_API_KEY` and `GOOGLE_API_KEY` unset. The legacy workspace
responder can use Google when only its key is present. Its migration and AI
qualification remain unfinished; do not treat configured credentials as a
qualified tax-assistance service. Candidate document routes are disabled in
production pending evaluation.

## First run

1. Copy `.env.docker.example` to `.env.docker`.
2. Review the ports and database password in `.env.docker`.
3. Start the stack:

```bash
pnpm self-host:up
```

4. Open `http://127.0.0.1:3000`.
5. Create a workspace and upload supported sample forms.

To stop the stack:

```bash
pnpm self-host:down
```

To stream app logs:

```bash
pnpm self-host:logs
```

## Local development without Docker

1. Copy `.env.example` to `.env.local`.
2. Leave `MODEL_PROVIDER_API_KEY` blank for mock-local mode, or set it to enable the provider-safe summary route.
3. Start the app with `pnpm dev`.

## Deployment-mode boundary

- `TAX_ENGINE_DEPLOYMENT_MODE=self-host` is the default local path. In this mode, workspace creation stays browser-local and the Better Auth route at `/api/auth` is bypassed intentionally.
- `BETTER_AUTH_SECRET` and `BETTER_AUTH_TRUSTED_ORIGINS` can stay blank for self-host development. They only matter when testing the hosted preview boundary.
- If you switch to `TAX_ENGINE_DEPLOYMENT_MODE=hosted`, new workspace entry stops at the Better Auth gate instead of creating an anonymous local draft. Hosted preview now defaults to the in-memory adapter boundary when `TAX_ENGINE_HOSTED_PERSISTENCE_BACKEND=preview-memory`.
- Set `TAX_ENGINE_HOSTED_PERSISTENCE_BACKEND=postgres-s3` only when you are also registering or injecting a real hosted workspace store and blob adapter. Self-host mode ignores this setting completely.

## Sample documents

Official fixtures are tracked in `sample-documents/registry.json`.

Fetch them locally with:

```bash
pnpm sample-docs:fetch
```

The downloaded PDFs land in `sample-documents/downloads/` and are ignored by git. They are useful for local upload testing and for the Playwright happy path.

## Notes

- Browser storage is the active self-host persistence path today. Clearing browser storage clears the local workspace on that device. A Postgres volume backup does not restore browser-only facts or documents.
- Current review bundles omit private identifiers and are not complete recovery backups. A full-fidelity local backup/import path still needs implementation and testing; retain original documents separately.
- All available outputs remain experimental or review-only. Tax year 2026 calculation, filing PDFs and e-filing are unavailable; see `/support`.
- Hosted preview keeps using the in-memory adapter until a real Postgres/S3-backed store factory is registered or injected behind the hosted persistence boundary.
- The Better Auth route is present for hosted preview work, but self-host mode bypasses it completely so local use never depends on hosted account setup.
- No raw direct identifiers should cross the provider boundary; the provider route stays behind the existing redaction layer in both Docker and local dev modes.
