# 2026 upgrade implementation evidence

Started 2026-10-24 from `f1f79ec5c38a770cc1f4989e67a12d6ac44f3fda`.
Remote refreshed before edits; no upstream commits were missing. The existing
`docs/reviews/` documents were preserved. Formal verification is out of scope.

## Baseline and security patch package

- Node 24.22.1, pnpm 10.34.8, Node 24 types; versions verified against the
  official npm registry and [Node release](https://nodejs.org/en/blog/release/v24.22.1).
- Compatible requested dependency updates, retaining TypeScript 5.9.3,
  Decimal.js 10.6.0 and pdf-lib 1.17.1. Next remains 15.5.28 in this first package.
  Vite 7.3.7 and PostCSS 8.5.23 address transitive advisories; OpenTelemetry API
  1.9.0 satisfies the SDK's `<1.10.0` peer requirement.
- Hash-pinned Python/pypdf setup and explicit interpreter selection; deterministic
  committed coverage inventory with a stale-file check. The inventory records
  implementation references and is explicitly not filing qualification.
- The auth limiter regression test isolates Better Auth's password delay;
  separate auth tests still exercise Better Auth. CORS tests resolve Next from
  the web workspace, avoiding an accidental hoisted dependency.
- Hosted production requires Redis at startup and rejects protected operations
  on missing configuration, errors, or Upstash's fail-open timeout response.
  Local/self-host requests retain memory limits. Outage responses are 503, quota
  responses remain 429. Tests simulate independent local stores and recovery;
  live Redis/multi-instance staging validation remains required.
- CI now requires coverage, contracts/web type checks, inventory freshness,
  browser flows on every PR, and an image smoke/SBOM job. Docker copies public
  assets and blank templates. These workflows are configured, not yet run remotely.

Local checkpoint: 14,982 tests passed in 471 files with Python enabled. Engine,
contracts and web type checks passed; Next 15 build passed. Coverage was 91.19%
statements, 81.14% branches, 90.55% functions and 91.68% lines. **The 85% branch
gate fails and has not been weakened.** Coverage includes web and shared-package
code as well as the engine. Browser and container execution are separate checks.

Audit refresh: 6 critical / 54 high initially; 0 critical / 1 high after the
compatible patch pass. The remaining `pdfjs-dist` advisory requires its separate
major migration; this checkpoint is not a clean security release. Audit counts
do not establish deployed exploitability. The SBOM job scans the built runtime
image using [Syft](https://github.com/anchore/sbom-action), not just manifests.

Raw local logs are in ignored `.local/upgrade-evidence/`. No staging or production
deployment, live billing, provider quality evaluation, or independent tax review
has been performed. Existing PDFs and state “supported” labels do not establish
filing readiness or e-filing capability.
