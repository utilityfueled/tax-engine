# Self-Hosting

The current self-host target is a single `docker compose` stack for the monorepo.

The image uses Node 24.22.1 and includes public assets and blank PDF templates.
`/api/health` reports process liveness; it does not certify database health,
tax-law completeness, or filing readiness. CI builds the runtime image, smoke
tests it without AI credentials, exercises browser/recovery flows, and produces
a CycloneDX SBOM and vulnerability report for that image. A passing CI check does
not replace the separate advisory disposition or release qualification.
Local container checks require Docker or Podman. For Docker, run
`docker build -t tax-engine:ci .` then
`node scripts/smoke-container.mjs tax-engine:ci`. For Podman, build the same
Dockerfile with `--format docker` so its health check is retained, and set
`TAX_ENGINE_CONTAINER_RUNTIME=podman` for the smoke script.
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
`OPENAI_API_KEY`, `GEMINI_API_KEY` and `GOOGLE_API_KEY` unset. Keys alone cannot
enable AI. The task adapter requires an explicitly selected provider and a
qualified rollout; the shipped rollout is empty. Candidate routes remain
disabled pending independent evaluation and authorization.

## First run

The web container keeps its root filesystem read-only. Compose provides bounded
temporary memory filesystems for `/tmp` and the image optimizer's cache. The
non-root application user writes the cached files. Cached public images are disposable; this
cache is not a backup of return facts or documents.

1. Copy `.env.docker.example` to `.env.docker`.
2. Review the ports and database password in `.env.docker`. Set
   `TAX_ENGINE_APP_URL` to the exact URL you will open, including its published
   port. For example, with `WEB_PORT=3109`, use
   `TAX_ENGINE_APP_URL=http://127.0.0.1:3109`. For a reverse proxy, use its public
   HTTPS origin. `localhost` and `127.0.0.1` are different browser origins.
3. Start the stack:

```bash
pnpm self-host:up
```

4. Open the `TAX_ENGINE_APP_URL` configured in step 2.
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
2. Leave provider keys blank for deterministic local operation. A key does not enable an unqualified route.
3. Start the app with `pnpm dev`.

## Deployment-mode boundary

- `TAX_ENGINE_DEPLOYMENT_MODE=self-host` is the default local path. In this mode, workspace creation stays browser-local and the Better Auth route at `/api/auth` is bypassed intentionally.
- `BETTER_AUTH_SECRET` and `BETTER_AUTH_TRUSTED_ORIGINS` can stay blank for self-host development. They only matter when testing the hosted preview boundary.
- If you switch to `TAX_ENGINE_DEPLOYMENT_MODE=hosted`, new workspace entry stops at the Better Auth gate instead of creating an anonymous local draft. Hosted preview now defaults to the in-memory adapter boundary when `TAX_ENGINE_HOSTED_PERSISTENCE_BACKEND=preview-memory`.
- With `TAX_ENGINE_HOSTED_PERSISTENCE_BACKEND=postgres-s3`, the hosted route creates the built-in PostgreSQL workspace-shell store using `DATABASE_URL`. The stored shell contains allowlisted progress metadata; original documents and guided taxpayer facts remain in the browser. A separate blob-store injection is not required for this shell path, and the setting does not enable durable document uploads. Self-host mode ignores it.

## Sample documents

Official fixtures are tracked in `sample-documents/registry.json`.

Fetch them locally with:

```bash
pnpm sample-docs:fetch
```

The downloaded PDFs land in `sample-documents/downloads/` and are ignored by git. They are useful for local upload testing and for the Playwright happy path.

## Notes

- Browser storage is the active self-host persistence path today. Clearing browser storage clears the local workspace on that device. A Postgres volume backup does not restore browser-only facts or documents.
- Use **Back up this return** in the saved-returns list to download an encrypted recovery file containing the workspace, guided answers, original document bytes and local display preference. Choose a password of at least 12 characters and keep it separately. A missing original blocks complete backup.
- Use **Restore an encrypted backup** to restore on another browser/device as a new local return. Recovery verifies the encrypted contents and file hashes, requires durable document storage, preserves known or unknown years, and clears cached calculation previews for fresh review. It does not overwrite an existing return.
- Keep both your backup and password: server Postgres backups and redacted review bundles cannot recover browser-only facts or original files. The encrypted recovery payload is limited to 64 MiB (96 MiB input file). No account or AI service is needed. Deleting a return also removes its cached original files, guided answers and preference on that device.
- All available outputs remain experimental or review-only. Tax year 2026 calculation, filing PDFs and e-filing are unavailable; see `/support`.
- Hosted preview uses the in-memory adapter when `preview-memory` is selected. Hosted production requires the configured PostgreSQL shell store, authentication, billing and shared rate limiting. A working local database does not establish those staging checks.
- The Better Auth route is present for hosted preview work, but self-host mode bypasses it completely so local use never depends on hosted account setup.
- No raw direct identifiers should cross the provider boundary; the provider route stays behind the existing redaction layer in both Docker and local dev modes.

## Isolated release rehearsal

With two locally built images for the same architecture, installed workspace
dependencies, Playwright Chromium and PostgreSQL 16 client tools, run:

```bash
node --import tsx scripts/rehearse-self-host-release.mjs PREVIOUS_IMAGE CANDIDATE_IMAGE
```

For Podman, set `TAX_ENGINE_CONTAINER_RUNTIME=podman`. If PostgreSQL client tools
are outside PATH, set `TAX_ENGINE_TEST_POSTGRES_BIN` to their directory. The script
creates and removes only its own Compose project, volume and browser profile.
It uses loopback ports, synthetic facts and no provider or payment keys. It checks
upgrade, database restart, dump/restore, rollback, browser backup/restore and
deletion, including original document bytes and exact values.

This verifies local recovery with the current application schema. It does not
verify historical hosted-schema downgrade, hosted authentication or staging.
See [recorded candidate evidence](upgrade-2026-self-host-rehearsal.json) for the
exact image, commit, platform and limits of the latest completed run.
