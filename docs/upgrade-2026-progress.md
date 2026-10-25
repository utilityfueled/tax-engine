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

## Explicit year boundary

The 2026 alias is removed. The 2025 constants and nested Decimal values are
frozen, with separate version/source/retrieval/review metadata for each year.
The 2026 pack is explicitly incomplete and rejects federal calculations;
unknown years also reject. This closes the silent fallback but does not yet
implement 2026 law. Standalone empty PA Schedule D calculations no longer need
federal constants; home-sale exclusions still reject unavailable rules.
All 15,018 tests, engine type checking and spec validation pass.

## Guided year, identity and money boundary

Guided interviews now carry an explicit year through storage, federal/state
preview and export validation. Legacy saved interviews without a year retain
an unknown year until the user confirms it; a workspace mismatch blocks output.
The form collects actual primary/spouse birth dates and residency, and requires
complete dependent identities and explicit credit answers. No count-generated
children, default birth dates, default addresses, or zero-to-twelve residency
conversion remain in this adapter. Missing employer IDs and trade dates stay
empty. Credit qualification itself still needs the broader eligibility work.

Monetary parsing and aggregation in the guided bridge and preview use Decimal;
malformed nonempty amounts reject instead of becoming zero. The deduction UI
shows expenses before tax limits and no longer claims that raw totals are tax
savings. Required-fact and year failures cannot fall back to a workspace preview
PDF. Tests use explicit synthetic facts, not production defaults.

Local results: 15,019 tests pass; web type checking, spec validation and focused
lint pass. Browser flows still need updating and rehearsal. This package does
not yet replace the separate advanced-preview synthetic input, qualify credit
eligibility, or remove all legacy mortgage/donation/payment defaults. Those
remain blockers to complete filing exports.

## Stripe 23 migration

Stripe 23.0.1 is pinned with API `2026-09-30.endive` in both clients and the
test-mode webhook rehearsal script. Checkout now uses
`allowed_payment_method_types`, following the [Endive change](https://docs.stripe.com/changelog/endive/2026-09-30/remove-payment-method-types-checkout-sessions).
Web type checking and 57 billing/auth tests pass, including retry/duplicate
handling and credit-purchase event tests. No Stripe account or endpoint settings
were changed. Before deployment, create a test-mode Endive endpoint, replay
duplicate and failed credit events against the real database, reconcile credits,
and rehearse reverting both the application commit and endpoint version. The
previous Dahlia application and endpoint must be retained until that passes.

## 2026 indexed data (partial pack)

Independent 2026 data now records ordinary brackets, standard deductions,
capital-gain thresholds, EIC table parameters, AMT limits and the Social Security
wage base. The AMT reduction rate is year-specific (25% in 2025, 50% in 2026).
Sources: [Rev. Proc. 2025-32](https://www.irs.gov/irb/2025-45_IRB),
[IRC 55](https://uscode.house.gov/us/usc/119-118/t26/s55/), and
[SSA](https://www.ssa.gov/OACT/COLA/cbb.html), retrieved 2026-10-24.
The spec preceded tests and implementation. All 42 new cases pass; the full
suite has 15,061 passes after fixing two literal spec test-name references.
Engine type checking passes. These rate-schedule and exemption cases are not a
complete Form 1040/6251/EIC qualification, and full 2026 calculation remains
blocked. Independent review, remaining law, form numbering and mappings remain
required. The source check also identified a pre-existing 2025 single/HOH AMT
phase-out threshold error; its correction is a separate change.

## Additional 2025 AMT regression

The single/HOH phase-out threshold is corrected from the 2024 amount to $626,350,
as specified by the [2025 Form 6251 exemption worksheet](https://www.irs.gov/instructions/i6251).
Sixteen literal boundary cases were added after the spec update; 12 failed before
the correction. Existing fixtures now use the correct 2025 threshold. All 15,077
tests pass. Prior-year Form 8801 amounts were preserved. This does not qualify
the full Form 6251 mapping or all AMT adjustments.

## Review PDF boundary

The return orchestrator rejects filing-purpose exports, mismatched calculation
years and unavailable mapping years before reading/writing PDFs. Current 2025
mapping metadata explicitly says review-only; 2026 mappings remain unavailable.
Each exported page carries `FOR REVIEW ONLY - NOT FOR FILING`, including web
cover pages and supplementary state summaries. Web downloads remain ID-redacted,
use review filenames and no-store headers, and require guided taxpayer facts;
the synthetic advanced preview can no longer become an exported return.
Readiness responses explicitly report `filingQualified: false`.

The full suite has 15,080 passes; focused PDF/readiness/route tests and web type
checking pass. A shared-output race in older PDF tests was found and those
fixtures now use isolated temporary directories. The existing blank-template
files still need per-form revision/hash qualification and physical year
versioning. These safeguards do not establish complete-data filing exports.

## AI candidate registry and accounting groundwork

Task profiles now record model/provider/effort, versioned prompt/schema IDs,
input/output budgets, timeout, escalation and confirmation requirements. New
profiles remain candidates: the registry returns deterministic fallback in
production. No provider account capability or model quality is certified by this
configuration. Cache-key components include owner, content, year, rules, task,
model, effort and prompt/schema versions; no taxpayer cache was enabled.

Pricing was refreshed against [OpenAI](https://developers.openai.com/api/docs/pricing)
and [Google](https://ai.google.dev/gemini-api/docs/pricing) on 2026-10-24.
Decimal accounting distinguishes exact provider USD cost from the minimum
one-cent retail charge, handles supported cache/long-context/regional prices,
and switches Google pricing on 2027-01-01 UTC. Unknown prices fail explicitly.
Legacy helper billing uses this accounting and reports whether token counts are
provider-reported or estimated. Workspace Responses requests and Gemini requests
now enforce the configured output reservation (default 4,096, including reasoning);
Gemini calls have bounded timeouts. Statement amount ordering uses Decimal.
All 15,090 tests and web type checking pass at this checkpoint.

Remaining AI work is substantial: the legacy live routing and hand-scored model
benchmark still need replacement; document normalization must move behind the
task adapter; 200–300 independently reviewed cases, held-out repeated live runs,
citations, measured latency/cost, atomic credit reservation/settlement, database
cost persistence and staged rollout/rollback are not complete. The new registry
is groundwork, not a model promotion. Existing GPT-5 Mini is now marked deprecated
in its official model documentation; actual account availability remains unchecked.

## Candidate document adapter and Decimal input handling

Document analysis now uses task-specific, strict schemas behind the shared
adapter. Only a trusted synthetic evaluation caller can run candidate profiles;
production falls back to deterministic parsing. Calls accept redacted text only,
use fixed provider endpoints, `store: false` for Responses, bounded response and
input/output sizes, and no hidden retry or provider switch. Source quotes and
Decimal comparisons reject invented amounts, dates and duplicate suggestions.
Merchant/category evidence never establishes business use. Source quotes survive
normalization for review. Hosted document routes retain access checks but do not
reserve or debit AI credits when no provider call occurs.

Currency display and statement aggregation no longer round-trip amounts through
JavaScript numbers. Large-cent regressions fail before the fix and pass after it.
The adapter records provider-reported costs even when content validation fails;
HTTP/transport failures with unknown usage still require later reconciliation.
No provider was called in these tests. All 15,126 unit/integration tests pass at this checkpoint.
Web type checking and focused lint pass. Production-browser currency entry tests
pass for dependent care and solar fields.

This replaces the document path, not the legacy live workspace responder or
hand-scored benchmark. Exact cost persistence, atomic credit reservation,
independent evaluation/review, and production rollout remain unfinished.

## Statement duplicate preservation

The redacted text adapter preserves repeated transaction lines in source order.
Removing duplicate lines could erase separate purchases, refunds or transfers.
The added regression failed before the change and passes afterward; this is a
local deterministic check, not a provider extraction evaluation.

## Measured AI evaluation harness

The four-model union and hand-assigned quality/latency scores are removed.
The harness lists effort-specific candidate profiles and both requested baselines,
uses strict run records, and computes monetary/date exact match, abstention,
grounding, human review results, P50/P95 latency, actual cost and January 2027
cost with Decimal. Failed outputs and the single permitted escalation still
contribute cost; unknown usage prevents promotion review. Duplicate run records,
unknown profiles, invalid usage and excess escalation reject.

The generated corpus has 240 **draft, unreviewed** cases across eight tasks and
ten scenario families with three variants each, including 80 fixed held-out
variants. This is a scaffold for review, not 240 independently validated scenarios.
The committed live-run file is empty. Actual application-schema validation,
independent expected-output/PII review, broader scenario diversity and live runs
remain required. All 20 focused harness/CLI tests pass. They simulate measurement
records; no model was called. No recommendation is emitted from configuration,
and even a passing report cannot activate production routes. See
[the evaluation procedure](strategy/model-stack-eval.md).

## Public support boundaries

The new `/support` matrix reports year, jurisdiction, residency, scenario and
output limits. All filing and electronic submission remain unavailable. Public
help/home text and state labels now distinguish an existing implementation from
qualification; the six dedicated state engines are not represented as reviewed
filing support. The guided generic preview is explicitly unqualified too.
The 78 focused support/copy tests pass. This status page is a disclosure, not
completion of the state gap analysis or a selection of launch states.

## Advanced preview facts and local deletion

Advanced document-only previews no longer manufacture a taxpayer, filing
status, birth date, SSN or address. The input adapter requires explicit taxpayer
facts and matching year before calculating; hydration discards legacy synthetic
previews. Guided calculations use their separately validated facts. Positive
adapter tests now supply named synthetic test fixtures explicitly.

Deleting a workspace also removes its scoped guided answers and mode preference,
even when its main record is already absent; another workspace is preserved.
An unversioned `fw2.pdf` filename no longer selects the 2026 sample fixture.
The new deletion, stale-preview and ambiguous-filename regressions pass. This
package does not complete every eligibility or residency rule, nor remove the
remaining legacy mortgage, donation, retirement and education assumptions.

## PDF test isolation under coverage

A coverage run alongside the browser suite exceeded the default five-second
limit in one test that built three full PDF packets in sequence. The loss, gain
and no-residual cases are now separate tests with individual temporary outputs
and matching spec references; no assertion or timeout was weakened. All 15,141
tests pass under coverage after this split. Branch coverage remains **81.52%
(16,261 / 19,946)**, below the unchanged 85% gate; the coverage command therefore
fails. Statements 91.29%, lines 91.83% and functions 90.61% pass their gates.

## Browser baseline and exact display amounts

The production-build Chromium suite now has **293 passes, zero failures and
five hosted tests skipped**, with retries disabled. It exercises upload and
confirmation, missing birth dates, year mismatch, navigation, keyboard/mobile
layouts, review bundle export, reopening and deletion with synthetic data and
provider/billing credentials disabled. Hosted skips are not hosted-service proof.

Browser failures exposed a real guided-section remount race that discarded the
first edit after navigation; sections now use a stable section ID key. Required
fact failures clear the estimate rather than reusing a stale workspace preview.
Fixture confirmations use the source type, not only a human-readable label.
Ticker aggregation, formatting and animation preserve Decimal amounts; large
cent-value regressions now pass. Browser tests use explicit taxpayer fixtures
and actual field labels and assert review-only output.
