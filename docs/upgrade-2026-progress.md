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

## Next 16 migration

Next and its ESLint plugin are pinned to 16.4.3. Development and production
builds explicitly use webpack to preserve the source aliases, following the
[official migration guide](https://nextjs.org/docs/app/guides/upgrading/version-16).
Web type checking and the production build pass. The first full test run had
14,981 passes and one obsolete Docker-context assertion; the corrected test now
requires blank templates and excludes filled returns (48 focused tests pass).
Browser qualification is in progress; nested main landmarks were reproduced.
The generated Next type references are retained.

## PDF.js 6 security migration and browser baseline

PDF.js is pinned to 6.4.299, with a matching bundled browser worker. Extraction
releases pages/loading tasks, disables worker resource fetching, and bounds the
optional `pdftotext` subprocess to 15 seconds. Providers still receive redacted
text only. Two real-library synthetic tests check exact text, page order,
malformed input and subsequent recovery. Web type checking and production build
pass. The post-migration audit reports zero advisories (488 dependency entries).
This is an advisory scan, not a security certification or deployed SBOM.

The four browser landmark checks pass after removing nested main elements.
The full browser baseline exposed obsolete onboarding helpers and was stopped
after repeated failures; its upload/confirmation/export lifecycle is not yet
qualified. Next's local generated agent guidance is retained.

## 2025 SALT and child-credit correction

Sources retrieved 2026-10-24: [2025 Schedule A instructions](https://www.irs.gov/instructions/i1040sca)
and [2025 Schedule 8812 instructions](https://www.irs.gov/instructions/i1040s8).
Specs were updated before 30 literal regression cases; 23 failed before the
implementation. The child credit is $2,200, with the separate $1,700 ACTC cap.
SALT uses the $40,000 maximum, MAGI phase-down and $10,000 floor. MFS halves the
worksheet result after phase-down ($20,000 maximum/$5,000 floor). Form 2555
exclusions and housing deduction are added back, with explicit Puerto Rico and
Form 4563 addback inputs. Schedule A audit lines 5b–5e now match the published form.

Older unit and integration fixtures were updated for the changed limits,
including moving full phase-out and exact-tax-liability cases to the new credit
boundaries. The full suite passes: 15,015 tests in 473 files. Spec validation,
engine/web/contracts type checks pass. Expected worksheet literals are agent
derived; **independent human tax review remains pending**. This corrects the
reported amounts and SALT phase-down, not all 2025 eligibility/ACTC branches.
The taxable-refund worksheet still models the prior 2024 SALT regime; it must be
made year-aware before using it for a 2026 return. No filing claim is enabled.
