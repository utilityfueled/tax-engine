# Tax Engine

Spec-driven federal and state income tax calculation engine in TypeScript.

This repository focuses on auditability:
- Tax rules are documented in YAML specs under `spec/`
- Calculations live in typed engine modules under `src/`
- Tests validate forms, schedules, worksheets, state returns, and PDF output

## Status

Current capabilities include:
- Federal Form 1040 orchestration and many supporting forms and schedules
- State support for all 50 states with deeper validated coverage for selected states
- Fillable PDF generation for supported federal and state forms
- A local-first web app for guided return preparation

Current non-goals:
- This is not legal, tax, or financial advice
- This project does not currently e-file returns

## Repository Layout

```text
apps/web/           Next.js web app
packages/           Shared workspace packages
spec/               Tax rule specifications and test references
src/                Core engine, models, CLI, PDF filling, utilities
tests/              Unit and integration tests
forms/blank/        Blank PDF forms used for filling tests
```

## Getting Started

### Prerequisites

- Node.js 24.22.1 (`nvm use`, or a runtime manager reading `.node-version`)
- pnpm 10.34.8 (pinned in `packageManager`)
- Python 3.13+ with `venv` for PDF text assertions

### Install

```bash
pnpm install
pnpm test:setup
```

### Run the app

```bash
pnpm dev
```

### Run the engine test suite

```bash
pnpm test
```

### Useful commands

```bash
pnpm build
pnpm build:web
pnpm lint
pnpm typecheck
pnpm typecheck:contracts
pnpm typecheck:web
pnpm spec:validate
pnpm spec:inventory:check
pnpm test:coverage
pnpm --filter @tax-engine/web exec playwright install chromium
pnpm sample-docs:fetch
pnpm test:web
```

`pnpm test:setup` creates an isolated `.local/pdf-test-venv` with hash-pinned
`pypdf`. Tests use that interpreter; `TAX_ENGINE_PDF_TEST_PYTHON` may point to an
equivalent environment. Regenerate the committed implementation inventory with
`pnpm spec:inventory` after adding specs or test references. Inventory entries
record code and reference existence, not tax-law review or filing qualification.
The coverage gate remains 85% for branches. Hosted browser tests require the
separate database and Stripe setup below; skipped hosted tests are not release
evidence.

### Hosted billing webhook smoke

If you have local sandbox credentials in `apps/web/.env.local`, you can run the real hosted billing webhook smoke end to end:

```bash
pnpm --filter @tax-engine/web test:e2e:hosted:webhook
```

This command:
- starts a temporary Cloudflare tunnel to your local app
- creates a temporary Stripe sandbox webhook endpoint for `/api/billing/webhook`
- runs the real hosted Stripe checkout + webhook Playwright smoke
- deletes the temporary webhook endpoint when finished

The smoke harness now reuses the dev server it starts itself, so it no longer collides with Playwright's built-in web server on port `3099`.

Prerequisites:
- `cloudflared` installed locally
- Stripe sandbox keys and hosted pricing IDs in `apps/web/.env.local`
- a reachable test database for hosted auth and billing persistence

## Hosted Deployment Notes

For Vercel staging on `staging.vivalatax.com`, set these environment variables in the Vercel project instead of reusing `apps/web/.env.local`:

- `TAX_ENGINE_DEPLOYMENT_MODE=hosted`
- `TAX_ENGINE_HOSTED_PERSISTENCE_BACKEND=postgres-s3`
- `TAX_ENGINE_BILLING_MODE=test`
- `TAX_ENGINE_APP_URL=https://staging.vivalatax.com`
- `TAX_ENGINE_CANONICAL_HOSTNAME=vivalatax.com`
- `BETTER_AUTH_TRUSTED_ORIGINS=https://staging.vivalatax.com`
- `BETTER_AUTH_SECRET=<new random secret>`
- `DATABASE_URL=<staging postgres connection string>`
- `STRIPE_SECRET_KEY=<stripe test secret key>`
- `STRIPE_WEBHOOK_SECRET=<secret from the staging Stripe webhook endpoint>`
- `STRIPE_PRICE_ID_STARTER_MONTHLY=<stripe test price id>`
- `STRIPE_PRICE_ID_PLUS_MONTHLY=<stripe test price id>`
- `STRIPE_PRICE_ID_AI_HELPER_TOP_UP=<stripe test price id>`

Hosted production requires shared rate limiting. Add one of these Redis configurations:

- Vercel KV / Upstash integration: Vercel injects `KV_REST_API_URL` and `KV_REST_API_TOKEN` automatically.
- Direct Upstash REST credentials: set `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`.
- Optional: `TAX_ENGINE_RATE_LIMIT_PREFIX=tax-engine:staging:ratelimit` so staging and production do not share buckets.

Missing shared configuration blocks hosted production startup. During Redis
errors or timeouts, protected routes return retryable HTTP 503 responses before
auth, billing, upload, or AI work. Self-host mode can use process-local limits.

Vercel Analytics is now wired into the app shell with `@vercel/analytics`; no extra app code is needed beyond deploying on Vercel.

Sentry is also wired in for Next.js App Router error and trace capture. To finish setup in Vercel, add:

- `NEXT_PUBLIC_SENTRY_DSN=<client DSN>`
- `SENTRY_DSN=<optional server DSN override>`
- `SENTRY_ORG=<your sentry org slug>`
- `SENTRY_PROJECT=<your sentry project slug>`
- `SENTRY_AUTH_TOKEN=<token used for source map upload during builds>`
- `SENTRY_ENVIRONMENT=staging` for staging and `SENTRY_ENVIRONMENT=production` for prod
- `SENTRY_TRACES_SAMPLE_RATE=0.1` (adjust to taste)

The Sentry Next.js SDK is configured with a same-origin tunnel route at `/monitoring`, so browser error and trace events do not require widening the production CSP beyond the app origin.

Production should use the same variable names, but with:

- `TAX_ENGINE_APP_URL=https://vivalatax.com`
- `BETTER_AUTH_TRUSTED_ORIGINS=https://vivalatax.com`
- live Stripe keys, webhook secret, and live price IDs

The app now serves `noindex` metadata and a disallow-all `robots.txt` whenever the configured app URL is not the canonical production hostname, so staging deployments on `staging.vivalatax.com` stay out of search indexes by default.

## Development Workflow

Tax calculations in this repo follow a spec-first workflow:

1. Add or update the spec entry in `spec/`
2. Add the failing test that references that spec entry
3. Implement the calculation
4. Run the relevant tests and `pnpm spec:validate`

Additional contributor guidance lives in [CONTRIBUTING.md](./CONTRIBUTING.md).

## Security and Privacy

- Keep test fixtures synthetic
- Do not commit real taxpayer data, credentials, or internal-only operational files
- Report vulnerabilities privately per [SECURITY.md](./SECURITY.md)

## Support

- Official hosted Viva La Tax support: `support@vivalatax.com`
- Usage and contributor questions: [SUPPORT.md](./SUPPORT.md)
- Bug reports and feature requests: GitHub Issues
- Security issues: private disclosure only

## License

This repository is licensed under `AGPL-3.0-only`. See [LICENSE](./LICENSE).

Brand names and logos are covered separately. See [TRADEMARKS.md](./TRADEMARKS.md).
