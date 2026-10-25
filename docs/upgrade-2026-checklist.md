# Remaining 2026 upgrade execution checklist

This is the durable working checklist for the execution brief. The historical
progress log and checkpoint are evidence for their recorded commits, not current
qualification. Resume here after compaction. Do not remove release gates to
complete a checkbox.

## Refreshed baseline — 2026-10-24

- [x] Read AGENTS, execution brief, progress and machine checkpoint.
- [x] Fetch origin: `48e872f` equals `origin/upgrade/2026-baseline` (0 ahead/behind).
- [x] Preserve unrelated untracked `docs/reviews/`.
- [x] Use Node `.local/toolchain/node-v24.22.1-darwin-arm64/bin` and pnpm 10.34.8;
  the interactive shell defaults to Node 22 and must not supply release evidence.
- [x] Refresh npm audit: zero advisories across 488 dependency entries, evidence
  `.local/upgrade-evidence/audit-resume-live.json`. No OS-image conclusion implied.
- [x] Refresh IRS Rev. Proc. 2025-32, Schedule A and 8812 instructions, AFTR
  Publication 6079 (May 2026), SSA wage bases and Publication 4557 (May 2024).
  The generic Schedule A/8812 instruction pages still identify 2025.
- [ ] Inspect current remote CI and run required workflows on this branch.
- [x] Frozen offline lockfile/strict-peer check in an isolated manifest copy;
  no checkout dependency or lockfile change. Sentry 11 reviewed separately in
  `upgrade-2026-telemetry-review.md`; version 10.76.2 retained.
- [ ] Scan final runtime images with current vulnerability data; document any
  unresolved exposure with owner and expiry.
- [ ] Raise branch coverage to at least 85% using meaningful tests.

## Packages and file ownership

| Package | Owner | Evidence and remaining work |
| --- | --- | --- |
| Federal law | `federal_law` agent | `upgrade-2026-federal-work.md`: immutable rules, year-aware refunds/carryovers, all remaining federal provisions; spec first and independent human review pending. |
| Taxpayer facts | `complete_facts` agent | `upgrade-2026-facts-work.md`: explicit source facts, zero/unknown handling, eligibility/residency/year validation, Decimal adapters/UI. |
| AI/billing/eval | `ai_billing` agent | `upgrade-2026-ai-work.md`: task routing, provider availability/prices, atomic exact ledger, corpus/evaluation and reversible rollout; live spend and human review pending. |
| Recovery/hosting | Parent | Full-fidelity encrypted browser backup/import and deletion; staging auth, isolation, outages, billing/migrations and restore; Docker/Compose upgrade/rollback and runtime scans. |
| States/forms | Parent | Demand-informed state gap analysis; physically version templates/maps, qualification gates and complete-data export distinct from review exports. |
| Coverage/release | Parent | Meaningful boundary/integration tests, all commands from brief, remote CI, artifact identity, review and push coherent packages. |

Each package evidence file must record official source URL/section/revision/date,
failing-to-passing regression evidence, checks, limitations and commit references.
Parent owns this checklist, progress and machine checkpoint. Agents commit only
owned files; parent reviews/integrates and pushes. No agent review substitutes for
required independent human review.

## External inputs requested early

Requested in this task while independent implementation proceeds:

- Authorized staging environment, secure location of test-mode credentials and
  permitted staging rehearsal operations. The README mentions
  `staging.vivalatax.com`; that alone is not deployment authorization.
- Approved budget and configured provider credentials for synthetic live runs.
  No OpenAI key was found in process or usual root/web environment files; no
  live provider request has been made in this resumed work.
- Independent human tax/spec/expected-output, security/privacy and AI-case
  reviewers, plus recorded review evidence. Agent-produced cases are unreviewed.
- Actual launch-state demand; PA-only, PA/OH and CA/NY were suggested choices.
- Final official 2026 forms and revisions for each scenario enabled for filing.

## Completion gates (all required)

- [ ] Complete facts and reviewed specs with independent expected outputs.
- [ ] Complete federal pack and demand-selected state scenarios qualified.
- [ ] Final physical year/revision maps and complete-data exports qualified.
- [ ] `pnpm test` and `pnpm test:coverage` (85% branches unchanged).
- [ ] `pnpm typecheck`, `pnpm typecheck:contracts`, `pnpm typecheck:web`.
- [ ] `pnpm spec:validate`, `pnpm spec:inventory:check`.
- [ ] `pnpm build`, `pnpm build:web`, `pnpm lint`, `pnpm test:web`.
- [ ] Remote CI on exact committed code; advisory disposition complete.
- [ ] AI representative corpus independently reviewed; repeated held-out live
  evaluation and baselines, exact costs/January prices, privacy/quality/latency
  budgets pass; route promotion separately authorized.
- [ ] Hosted staging security/auth/billing/outage/migration/backup rehearsal pass.
- [ ] Self-host full-fidelity recovery, target-platform upgrade/rollback and
  upload → confirm → calculate → export → reopen → delete pass.
- [ ] Final runtime image SBOM/scans and authorized versioned release artifacts
  match support claims and documentation.

No production deployment, filing enablement, model promotion or release
publication is authorized by a passing local test alone. The goal stays active
until the brief's criteria pass or only external actions remain.

## Current execution evidence (2026-10-24, still active)

- Federal commits: `49d3085`, `60b24f2` historical refund facts; `fe64b7a`
  independent 2026 constant data; `d657eee` Schedule 1-A; `55d5d7c` gambling and
  nonitemizer charity; `b9fda4b` historical QCD correction; `953aead` charitable
  category/floor worksheet. Full rule pack and carryover coordination remain open.
- Facts commits: `5d09daf`, `f312c2f`, `1d166e7`, `70f8d17`. Latest package has
  516 passing focused tests and web/contracts types. Remaining facts and federal
  eligibility integration are actively being implemented.
- Recovery `6bebb6d`, review corrections `937f4bf`: 84 focused tests and two
  Chromium tests pass, including original-byte equality after delete/reload/
  restore, reset retention, hosted local-return visibility and preserving local
  data on failed cloud deletion. Independent human security review is pending.
- Telemetry `3408c76`: 53 security tests, including real installed-SDK transport
  sanitization; no network telemetry in tests. Independent privacy review pending.
- Runtime `31d1b1a`: trixie base and runtime package-tool removal; local arm64
  health/non-root/template smoke passes. 67 distinct OS advisories remain in the
  explicit register, acceptance pending, review deadline 2026-11-07. This image is
  intermediate and must be rebuilt/scanned from final code on target platforms.
- Billing `0d90200`, overrun reconciliation `a649c61`: exact atomic ledger,
  19 disposable-Postgres tests pass. Task routing `d3778d8` removes legacy live
  responder defaults and binds explanations to validated server audits; draft
  corpus/account/P50 gates `c3909cf` retain no-promotion status.
- PDFs `a9745e8`, `c6db09e`, `3f71d42`: 41 templates and 90 mappings physically
  versioned under 2025; exact template hashes and strict field writes enforced.
  Existing 1040 semantic mislocations corrected using official form positions.
  908 full PDF tests plus four focused source-location/error tests pass; saved
  canonical values/widget appearances and both synthetic rendered pages checked.
  These remain historical review outputs, not qualified filing forms.
- Additional federal `c5d01c4`, `1e9ad95`, `9abdf5d`, `f4c8a25`, `2998547`,
  `c74f622` cover education identity, qualified PMI, section 68/QBI/AMT ordering,
  AMT addbacks, SALT facts and historical precision/QCD corrections. Dependent
  care `e2d93f0` has 67 focused passes; shared federal integration is in progress.
- Facts `a70b823`, `2c1dfd9`, `45f96c0` add explicit charity/education eligibility,
  extension/prior-year payments, IRA/alimony/household employee facts. Latest
  coherent package: 470 guided/preview tests, types, lint and spec checks pass.
- Diagnostic full coverage while tax packages were actively changing reports
  82.22% branches and 89.38% functions. It has concurrent test failures and is
  not a passing gate. All thresholds are unchanged; meaningful coverage work
  and a clean full rerun remain required. Evidence: `current-coverage-gaps.log`.
- Remote CI runs are being triggered by pushes. Superseded runs may be cancelled;
  no exact-final-commit CI success is claimed yet.

## Latest integrated evidence and immediate work

### Continuing integration after the prior diagnostic

- `1cb8711` publishes a year/jurisdiction/residency/output support matrix and
  refreshed PA/OH gap analysis. Actual launch-state demand is still pending.
- `a49300d` adds an explicit legacy metadata cleanup command and passes an
  actual disposable PostgreSQL dump/restore rehearsal across nine application
  tables, two owners with the same workspace ID and exact sub-cent provider cost.
  Fourteen migration/store tests, types and scoped lint pass. Reapplying cleanup
  after restoring a legacy backup is verified. This is local synthetic evidence;
  hosted auth tables, staging credentials and release rollback remain open.
- `9207583` copies Schedule 3 and Schedule 8812 printed amounts from audit lines;
  39 PDF checks pass. `2e852bc` adds the separate complete-data filing library
  pipeline, whose compiled qualification registry is empty. Twenty-seven gate
  tests pass; no live route, form, filing capability or approval is enabled.
- `c571b58` and `9c2fa0c` add abortable document analysis and real UI consent,
  cancellation, return-change and late-result protection. Fifty-five focused
  checks pass, with types/lint. Exact zero is preserved and invalid negative or
  sub-cent source amounts are not silently rounded into expenses.
- `6d71c4c` adds the compatible jsdom test dependency with strict peer checks;
  the refreshed package audit reports zero advisories across 519 entries.
- Federal `bc26ffe`, `2885753`, `ed5ac99` add actual possession exclusions,
  education eligibility and coherent credit limits/source metadata. PTC core
  `ca8c1e5` has 151 focused passes; federal integration `5e0822a` has 73 passes.
  Sources, special worksheet gaps and review limitations are in the package logs.
- Facts `49e607c`, `4dd6ebf`, `a0a4e21` collect credit identification, individual
  vehicle facts and individual adoption expense/benefit/history/child facts.
  Education interview expansion and remaining standard-deduction facts continue.
- Latest diagnostic: `.local/upgrade-evidence/coverage-after-credit-integration.log`
  has 15,745 passes / 30 failures / 19 skips while agents edited source. It did
  not produce a fresh coverage report. The prior 82.55% branch result is still a
  failed historical diagnostic, not a current measurement. Credit fixture owners
  have since reconciled assertions; PDF timeout checks need a stable bounded run.
- Immediate parent work is audited multi-student Form 8863 output, review-copy
  redaction after complete-input calculation, then a stable whole-suite/coverage
  run and meaningful remaining coverage. Hosted staging, independent reviews,
  live provider budget/account access and final official forms remain unprovided.

- Privacy commits `2d16a94`, `9e9462b`, `e910507`: complete name/header
  redaction, metadata allowlist at both browser/network and PostgreSQL boundaries,
  opaque upload names and response binding. Four real disposable-Postgres cases
  verify JSONB content, owner isolation, legacy reads and failure atomicity.
  Sanitized reads do not erase private content already present in legacy rows or
  backups; a separately rehearsed retention migration remains required.
- Billing boundaries `2b4b012`: 126 focused tests pass, web types and scoped lint
  pass. Auth/DB/provider errors cannot return private upstream messages; malformed
  workspace IDs reject before billing. These use mocks, not staging evidence.
- 1040 source forwarding `f07de24`: 31 focused PDF tests pass for separately
  audited wages/withholding and gross/net refund plus penalty. Existing mapping
  coordinates were unchanged; no new visual qualification is claimed.
- Federal source/care/QBI/payroll packages and vehicle transition work continue
  in `upgrade-2026-federal-work.md` and `upgrade-2026-ai-work.md`; complete-facts
  energy/identity UI and sparse parser hardening continue in facts evidence.
- Latest diagnostic full coverage: 15,581 pass / 50 fail across 525 files;
  branches 82.55%, functions 87.94%, statements 90.91%, lines 91.88%. It ran
  during active source edits and concurrent tests. Required gates remain red.
  Owners are reconciling source-based assertions; rerun with bounded workers to
  avoid shared-machine PDF timeouts, without changing test timeouts or thresholds.
- Remote CI at `e910507` failed unit assertions and generated inventory freshness;
  frozen install, build, engine/contracts types, lint and spec references passed.
  Coverage was not reached. Run: https://github.com/utilityfueled/tax-engine/actions/runs/40156586696.
- Next parent work: real UI privacy/cancellation interactions, support/gap matrix,
  separately gated complete-data export, legacy metadata cleanup rehearsal and
  final image/Compose recovery. User demand, secure staging access, approved live
  provider budget, final official forms and independent human reviews remain
  external inputs; no promotion, filing, production deployment or publication.
