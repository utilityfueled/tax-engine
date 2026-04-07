# Self-Hosting

The current self-host target is a single `docker compose` stack for the monorepo.

## What this stack does

- boots the Next.js app from `apps/web`
- provisions a local Postgres service so hosted-mode persistence adapters can be exercised locally
- keeps the current workspace local-first, with return drafts and upload metadata stored in browser storage
- works without any hosted dependency

If `MODEL_PROVIDER_API_KEY` is unset, provider-safe summaries stay on the built-in `mock-local` responder.

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

- Browser storage is the active self-host persistence path today. Clearing browser storage clears the local workspace on that device.
- Hosted preview keeps using the in-memory adapter until a real Postgres/S3-backed store factory is registered or injected behind the hosted persistence boundary.
- The Better Auth route is present for hosted preview work, but self-host mode bypasses it completely so local use never depends on hosted account setup.
- No raw direct identifiers should cross the provider boundary; the provider route stays behind the existing redaction layer in both Docker and local dev modes.
