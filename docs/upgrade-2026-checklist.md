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

## Stable snapshot and new packages — 2026-10-25

- Fixed commit `2cb61b3`, isolated tracked-file archive, Node24, two workers and
  disposable PostgreSQL16: **15,929 passed / six failed**, 545 passing files and
  five failing files. Coverage: branches **84.06%**, functions **89.81%**,
  statements 91.85%, lines 92.93%. Both branch/function gates still fail.
  Evidence: `.local/upgrade-evidence/stable-coverage-2cb61b3.log` and snapshot
  metadata; this supersedes concurrent-source diagnostics for that commit only.
- `edd564b` reconciles five official-source fixture assertions. The remaining
  workspace PTC marker is in the facts package. Newer remote CI also exposed
  legacy state W-2 inputs without EINs; federal owner is correcting 2025 handling.
- `ea95c66` renders all Form8863 students/institutions from exact audit amounts;
  `2cb61b3` redacts review identifiers only after full-fact calculation. Seventy-six
  focused checks pass, with four rendered synthetic pages inspected and notices
  on every page. Historical 2025 review output remains unqualified for filing.
- `7a2a95b`, `cddec72`, `632452b` add standard-deduction law, federal integration
  and actual eligibility/election facts. `ec59e76` separates excess Social
  Security by employer and owner. `5a5c6b3`/`8c459ce` use actual state payment year.
- `a44adbb`, `93f336c`, `45bb211` add actual-source prior minimum tax credit,
  audited Form8801 reference pages and federal integration. Focused module/PDF
  run: 92 passes; federal integration: 549 passes. Independent review pending.
- `935e0cc` hardens document/review-PDF requests (89 focused passes, web types,
  lint); `0eab56e` fixes stale recovery UI success after cancellation/unmount/
  return changes (33 focused passes, web types, lint). No staging evidence implied.
- `0c935f7` excludes isolated pnpm caches from container context; 48 checks pass.
- Remote `edd564b` CI failed unit regressions and inventory freshness. Current
  pushed `0eab56e` CI queued: https://github.com/utilityfueled/tax-engine/actions/runs/40160576899.
- Immediate parent work: request-stream cleanup, meaningful recovery/saved-return/
  billing UI checks, paid AI availability claims/purchase gating, then a stable
  rerun and final image/Compose rehearsal. Tax agents continue FEIE, credits and
  remaining actual income/source facts. All external inputs above remain pending.

## Stable coverage threshold reached; integration remains active — 2026-10-25

- Exact tracked snapshot `05ec24e`, Node 24, two workers and disposable PostgreSQL:
  **16,112 passed / 11 failed / zero skipped**, 562 passing and five failing files.
  Branches **85.15%**, functions **91.25%**, statements **92.49%**, lines **93.65%**
  meet the unchanged thresholds. The command still failed: seven PA/OH review
  packet fixtures and three CTC/source-ledger fixtures need explicit source facts;
  one partner-basis PDF test exceeded its existing five-second timeout under
  coverage. Do not claim a passing suite or weaken the timeout/assertions.
  Evidence: `.local/upgrade-evidence/stable-coverage-05ec24e.log`;
  snapshot metadata: `stable-snapshot-current.json`. Newer code needs a new run.
- `6e795b5` bounds request-stream lifetime (150 focused checks); `4f20049`
  prevents stale saved-return lists and overlapping deletions (61 focused checks).
- `1858703` gates extra-credit sales on the actual qualified production executor
  and provider configuration, fixes exact Decimal display, and corrects public
  availability/storage claims. Combined billing/UI/security run: 316 passes;
  contract/web types and scoped lint pass. No promotion or live spend occurred.
- `6ed4466` contains provider HTTP outages, cancellation and caching boundaries:
  104 focused checks, web types and lint pass. Nineteen initial regressions failed.
- `1d3fd90` requires actual W-2 owner and state facts. Its source/DOM/storage/PDF
  package has 616 passes and seven fresh production Chromium scenarios passing.
- `28ba63d`/`2e3fa87` add actual Form 2555 sources, net exclusion/housing routing,
  stacking and MAGI effects; `05ec24e` renders all audited foreign-income lines
  with per-page review warnings. Four synthetic pages inspected; no final 2026
  form qualification. `26661ba` corrects disjoint 1099-INT Boxes 1 and 3 federally.
- Current parent work: PA interest source/education-exclusion reconciliation,
  complete state-packet fixtures, clean full checks and final runtime/Compose
  recovery. Agents continue remaining income facts, Form 8815, Social Security
  exclusion worksheets and tax-table/capital-gain calculations. Independent
  review and every external prerequisite above remain pending.
- Remote CI at `1858703` was in progress when inspected:
  https://github.com/utilityfueled/tax-engine/actions/runs/40161538848.
  Superseded pushes were cancelled; exact final-code CI success is still required.


## Source integration and actual Compose recovery — 2026-10-25

- `0c1c2b9` reconciles PA interest with actual disjoint source boxes and bond
  exclusions; 399 focused checks pass. `9000ce3` carries actual Ohio investment
  withholding through calculation, adapter and review PDF; 133 checks pass.
- `ea34d6b` collects actual business/NEC facts; `94cc6bc` parses labelled NEC
  sources and removes document-only assumed-zero-expense previews. Investment
  sources are `4679852`; rental source contracts are `6bddb79` and guided work
  continues. See the facts package's explicit remaining software checklist.
- `1a815e0` corrects Schedule C other income/official fields; `c0871d3` separates
  Schedule SE by actual owner, corrects interactive per-owner PDFs and resolves
  the two old bond-interest source assertions. `e5696a2` corrects OID source
  boxes; return/state integration is still active. Bond/SSA packages are
  `acab62e`, `5604a87` and `da3e0fc`.
- `a2f62e2` adds a local-only pinned-endpoint Compose rehearsal. Exact candidate
  `da3e0fc` on arm64 passed upgrade, database restart, nine-table dump/restore,
  rollback, re-upgrade, encrypted browser backup/restore and deletion. Actual
  wrong-password/tamper checks pass after independent agent review corrections;
  all 12 endpoint tests and scoped lint/syntax checks pass. Digests and bounded
  raw-marker network evidence are in `upgrade-2026-self-host-rehearsal.json`.
  This is not historical hosted-schema downgrade, staging or human approval.
- The refreshed exact-image SBOM has 157 matches/67 distinct advisories, zero
  critical/npm matches and no reported fixed matches. Every advisory remains
  unresolved with owner confirmation pending and 2026-11-07 review deadline.
  Current package audit has zero advisories across 519 entries.
- Local amd64 QEMU compilation failed with signal 11. Native amd64 CI now builds
  a pinned previous commit, runs actual-image browser/Compose recovery and saves
  SBOM/scan evidence. No native result or artifact publication is yet claimed.
- Remote CI at `9000ce3` failed only the two source assertions corrected by
  `c0871d3` plus inventory freshness. New pushes include all commits through
  `a2f62e2`. The stable one-worker run at `c0871d3` completed with 16,241 passes
  and 14 failures; no fresh coverage percentages were emitted after failure.
- Parent next: finish that fixture, regenerate inventory at a stable boundary,
  correct Form2441 source/audit/PDF facts, adapt verified OID and actual rental
  ownership to PA/OH, then complete final image/browser checks. Federal owner
  continues OID/QBI/tax-table/IRA; the other agent owns bounded Form2210 work.
  All external inputs listed above remain pending. The goal remains active.

## Current integration corrections — 2026-10-25

- `6ef58a2` integrates actual OID sources federally; `fce3094` collects actual
  rental ownership/expenses; `b072884` preserves actual W-2 Box 7 and spouse
  payroll. `44793ac` calculates penalties from dated payment sources.
- `8262f40` preserves actual care incomes, prior-year worksheet credit and
  tentative/limited audit amounts (76 focused checks). `8ca3655` attributes QBI
  deductions by source/owner (215 focused checks) and fixes all eleven assigned
  tax regressions without weakening the expected tax outcomes.
- The PA business-packet fixture now states complete actual synthetic business
  facts and all five original packet assertions pass. The spec test-name checker
  now reads TypeScript literal names, including single quotes, while rejecting
  commented examples and unrelated strings; six checker tests pass. Logs:
  `pa-business-packet-facts-final.log`, `spec-literal-names.log` and
  `integration-fixtures-lint.log` under `.local/upgrade-evidence/`.
- Remote CI at `a2f62e2` has the same fourteen stable-run regressions and stale
  inventory. Native amd64 image build, health smoke, previous-image build and
  actual Compose upgrade/recovery/rollback passed; browser/SBOM/scan remained
  running when inspected. Final exact-code checks are still required.
