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
- [x] Raise branch coverage to at least 85% using meaningful tests: immutable
  `2f8abd7` reaches86.41%; full test/coverage command still failed twoPDFtimeouts
  and every newer integrated commit requires fresh verification.

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

## Current source/PDF integration and stable rerun — 2026-10-25

- `5d0ef3e` collects actual dependent-care providers/persons; `8f7f172` and
  `131a8f2` preserve audited amounts and source continuations. `f23a13a` fixes
  the required provider notice in the official constrained field. All 81 focused
  PDF/credit checks, types and lint pass; saved canonical values and rendered
  pages were checked. The care work document corrects an earlier premature
  success claim. Benefits Part III remains active separately.
- `91b4cd7` collects actual mortgage qualification/allocation facts; `5bfcfcf`
  preserves the actual IRA checkbox. Remaining retirement facts continue.
- `a269a9f`, `a656859`, `fe2ea81` integrate dated Form 2210 payments, audited
  physical fields and reconciled legacy fixtures. `d84d890` uses official AMT
  line identities; `a6ebd97` aggregates estate deductions once on Schedule A.
- The inventory was regenerated and its freshness check passed in an isolated
  archive of `f23a13a`, with 229 entries. This is traceability, not qualification.
- A full one-worker coverage run from that exact commit is active, using the
  disposable local PostgreSQL16 instance. The log is
  `.local/upgrade-evidence/stable-coverage-f23a13a.log`; no result is claimed yet.
- Remaining internal work includes tax-table/IRA rules, retirement and care
  benefits, PA/OH verified OID and rental ownership, full checks/browser runs,
  and final image/recovery evidence. All external inputs above remain pending.

## Immutable coverage result at f23a13a — 2026-10-25

The fixed committed archive completed in 426.69 seconds with 16,356 passing and
five failing tests,599 passing and four failing files, and zero skips. Unchanged
coverage thresholds pass: 85.96% branches, 91.61% functions, 92.72% statements and
94.00% lines. The full command remains failed. Three tests need actual synthetic
Form2210 payment facts; two AMT tests refer to superseded audit labels. These
corrections are assigned to the federal owner. Newer changes require another
full run. Evidence/hashes are in the machine checkpoint and
`.local/upgrade-evidence/stable-coverage-f23a13a.log`.

New packages: `f468453` actual Ohio OID interest/withholding (132 checks);
`d13fbee` actual retirement source/taxability facts (585 checks); `0b3d78e`
published 2022–25 Tax Table helper (69 checks); `812fc61` dependent-care benefits
core (207 checks). Each has source/evidence details in its package work document.
No external qualification or production readiness is implied.

## Integrated source packages and immutable coverage — 2026-10-25

- Pushed through `df1562b`: Pennsylvania actual rental classification, care
  Part III return integration `5fb2f7e`, care source UI `a615453`, actual Social
  Security UI `e66fa3d` plus placement correction `003609d`, and published Tax
  Table fixture corrections `dc1e900`, `ca3b62c`, `914a692`. The SSA correction
  was validated together before push; the intermediate malformed staging is
  not a qualified artifact. Shared patches now use full context.
- Immutable `99fc4c2` coverage: **16,384 pass, 25 fail, zero skip**, 603 passing
  and 10 failing files. Branches **86.06%**, functions **91.70%**, statements
  **92.75%**, lines **94.05%**; all thresholds met unchanged, command still red.
  The evidence log/hash is in the machine checkpoint. Twenty-three table-row
  expectation failures are corrected in the commits above. The Ohio fixture now
  derives a real Form2441 audit: $2,000 x 27% = $540 line9c, limited by its actual
  $400 tax liability on line11; Ohio's25% is still $100. The existing unrelated
  PDF timeout passes unchanged with that focused rerun:7/7 in4.26seconds.
  A fresh full run is required; no passing global gate is claimed.
- The final 2026 IRS Form4952 is now available at
  https://www.irs.gov/pub/irs-pdf/f4952.pdf (created May28,2026). Its source and
  exact hash are being recorded in the Form4952 package. This updates prior
  availability evidence for this specific form, not the qualification registry.
  Filing,2026 PDF exports,AI promotion and release claims remain gated.

## Actual-source integration through ff761dd — 2026-10-25

Pushed the Form4952 printed-line/source/PDF correction `d1b26ef`, regular-return
and election integration `9e6d794`, IRA core `c3fa9b4`, return `fa37e8d` and actual
source UI `6eb3747`, sparse actual W2 boxes `3c057f6`, care PartIII PDF `fd8658c`,
and independent PA expense worksheet `ff761dd`. The PA staged tree passes1,450
state/PDF/guided/DOM tests, types and3,504 spec references; see its work document.
The Form4952 package passed76 focused tests after an independent agent review
identified and verified repair of a missing-calculation export path; this does
not substitute for human qualification.

A fresh immutable full coverage run is underway at exact
`ff761dde6b7a2305cbf1adaafa0ad2609c0f3eef`, with the disposable local PostgreSQL
ledger service and unchanged thresholds. Its evidence path is
`.local/upgrade-evidence/stable-coverage-ff761dd.log`. No outcome is claimed yet.
Further AMT source, HSA, energy,529, export and final release checks continue.

## Immutable coverage outcome and next source packages — 2026-10-25

The `ff761dd` archive completed with16,494 pass,11 fail,zero skip across635 files
(632 pass,3 fail). Thresholds remain unchanged and pass:86.31% branches,
91.88% functions,92.76% statements,94.12% lines. The command is failed.
Seven IRA expectations were independently checked against Publication590-A and
corrected in `dd1b0a7`: deduction rounding, nonparticipant QSS and excess
contribution treatment. Four PDF timeouts passed unchanged on the exact same
archive (5 tests/2 files,8.03seconds); no timeout or assertion was relaxed.
This focused result does not establish a passing global run.

Integrated follow-ups include actual HSA ownership `b9071db`, energy installation
sources `30fc3dd`, separate AMT investment sources/PartIII `58d2a3e`, energy filing
status `cac5a87` and actual HSA limit/recapture sources `b1488d4`. Their package
documents retain source and focused check evidence. Guided HSA/energy,529,
canonical Schedule1,OID intake and final export/release work remain active.

## Review PDF, source intake and return integration — 2026-10-25

Pushed through`e49e1d0`: visible review notices survive template loads, appended
pages and merges (`28b0cd7`,1,028PDF/workspace checks); actual energy UI
`b84205d`, corrected printed insulation cap`190af2c`, canonical Schedule1/1040
source totals`1f4a614`,2026educator cap`472a190`, and actual physical5695sources
`24cbcf7` (1,021PDF tests/99files,114focused source/core/workspace checks).
Actual OID interview`e49e1d0` passed592isolated guided/DOM checks, root/web types
and3,593spec references; independent agent review ran57checks with no actionable
findings. That is not independent human tax qualification.

Individual HSA excess/core and review forms are committed locally as`104bca4`
with921focused checks and3,614spec references; the next push will include it.
State selection/payment consistency and dedicated PA/OH preview verification is
active. Whole-suite/coverage, final release artifacts, nativeamd64CI and the
external inputs above remain outstanding. All filing/promotion gates stay closed.

State package`ec225fe` passed1,496isolated tests/88files, root/web types and3,608
spec references. It separates selected jurisdiction from mailing address, keeps
explicit federal-only output federal-only, uses dedicatedPA/OH previews, shares
actual payment inputs with downloads and requires actual state for nonzeroPA
withholding. PA/OH part-year selections no longer print a resident calculation
without actual allocation inputs. Package evidence is in the guided-state work
document. Actual Ohio exempt-interest allocation intake is the next state slice.

## Current full run and actual HSA/Ohio sources — 2026-10-25

Pushed through `7a337a0`: actual HSA contribution/history sources `ed5cae9`,
actual distribution events and net exception allocation `b8e995a`, crypto gifts
through charitable limits/floor `ca323c5`, and actual Ohio issuer allocation
`7a337a0`. HSA distribution checks passed 1,257 isolated tests/49 files; crypto
passed 759 focused/adjacent checks. Ohio passed 1,326 isolated tests/60 files,
then 18 final guard/DOM/PDF checks, root/web types and 3,628 spec references.
See the package work documents for sources and exact boundaries.

The immutable `10be1de2e11362eb57fbfa26d871c64f30764fde` coverage command failed:
16,590 pass, 10 fail, zero skip, 654 files (648 passing), 432.56 seconds.
It produced no coverage report; the prior 86.31% branch result remains historical.
Six HSA source/oracle failures are addressed in `ed5cae9` and `4b5cacb` (118
focused checks); three audit-label and one Form461 source expectation failure
are assigned to the federal package. The Form461 investigation found a real
employee-wage exclusion issue requiring a separate source-first correction.
No new passing global gate is claimed.

Independent agent review of `ec225fe` found no actionable issues and passed
8 focused tests. Review of the new Ohio allocation package is pending. Neither
is human tax qualification. The fresh package audit reports zero advisories for
519 dependencies; runtime images still need a final-code scan.

A new production Chromium suite is running against immutable `4b5cacb` with
synthetic sample documents and self-host mode, no retries. Evidence:
`.local/upgrade-evidence/stable-browser-4b5cacb.log`. Remaining federal/facts/state
work continues in parallel. This run does not establish hosted staging evidence.


## Browser source-fixture audit and Form461 review — 2026-10-25

Ohio state attribution `054cd59` is pushed: nonzero withholding requires its
actual state across ten source categories; every supplied amount is validated
before exclusions. Unknown state is not silently treated as non-Ohio. The exact
staged tree passed741 tests/24files, root types and3629 spec references. See
`upgrade-2026-state-source-work.md`. Independent agent review of Ohio interest
`7a337a0` found no actionable findings and passed6 tests/twofiles; this is
software review, not human tax qualification.

The immutable production Chromium run at`4b5cacb` finished245pass,51fail and
five hosted skips in13.2minutes. Log:`.local/upgrade-evidence/stable-browser-4b5cacb.log`.
No passing browser gate is claimed. Failures include incomplete synthetic W2
Boxes7/10/12W, old aggregate donation/education/energy/payment controls, and
strict selectors matching new source explanations. Parent is repairing the
browser tests against the actual source-record UI with the same numeric and
privacy/readiness expectations. An isolated loopback runtime at the same commit
supports repair checks; a final committed full run is still required.

Form461 `9d814f9` corrects employee exclusion, official printed line identities,
capital gain/loss treatment and zero-addback attachment requirements. Parent
review caught invalid bounds on nonbusiness components of net amounts; actual
signed business-net conservation now accepts both offsetting directions and
rejects contradictory sources.608 staged checks pass; parent independently ran
13 source/PDF checks. Official IRS instructions and RevProc2025-32section4.31
were refreshed. Final2026 form and human review gates remain closed.

Education distribution core `eaaeb04` has102 isolated focused checks and493
adjacent working-tree checks. Its actual-source intake, federal reconciliation,
owner-specific5329 and reference PDF remain active work, documented in
`upgrade-2026-education-distribution-work.md`. Educator and remaining federal
packages continue independently. The last full unit/coverage command remains
red until a fresh immutable run verifies the integrated fixes.

## Current source packages and PDF timing correction — 2026-10-25

Immutable `2f8abd7` finished16,677pass,2fail,zero skip across669files in476.95s.
Coverage meets every unchanged threshold:86.41%branches,92.03%functions,
92.76%statements,94.33%lines. The two failures were PDF aggregate-test timeouts;
no numeric tax regression failed. The full command remains red.

`76bb3a6` separates the identical41template checks and PA/OH state cases into
individually named tests. No assertion, case, default timeout or coverage setting
changed. Exact staged tree`8054e7d` passes62tests and3,682spec references; see
`upgrade-2026-validation-work.md`. A fresh full run remains required.

Pushed through`76bb3a6`: actual educator`b4be8d6`, unknown qualified-stock
`758b024`, education source return`6b07529` and borrower links`2f8abd7`, actual
1098-E Box2`224b2ed`, PA withholding`a3f0bec`, browser source fixtures`6cda2c0`,
education distribution UI`9f2ce31`, ticker frame clamp`0be1714` and PDF cases.
The PA staged package passes939checks, types and384PArefs. The browser repair
cohort passes154of155; its final independently derived$8,288balance case then
passes separately against retained earlier runtime`4b5cacb`. It does not count
as a fresh full browser gate. The ticker has3red regressions then103combined
passes, with types/lint; current production browser verification is next.

Student-loan source core`d162f6c` passes127isolated checks, types and3,688refs.
Parent review found and verified a malformed legacy-interest guard correction.
Mortgage review found an independent interest/rate numerator reconciliation gap;
its source-first correction is in progress. Education reference PDF and separate
owner5329 work continue. Agent review is not independent human qualification.

Remote CI/Web at`76bb3a6` are running; previous`a3f0bec`runs were superseded.
Latest full local coverage/browser, inventory, remaining source integration and
final release artifacts remain open. Staging access, human reviews, live provider
account/budget, actual state demand and final2026forms remain external inputs.

Remote`6b07529`plain unit suite passed16,678tests/669files; coverage then failed
nine multi-document PDFtimeouts. Commits`76bb3a6`and`ddd8976`isolate every affected
case without removing any check or changing timeouts. The latter's staged tree
`9923ca59`passes55tests, types and3,688refs. Remote lint/types/build passed;
inventory remained stale. `05fd72a`adds audited education reference PDFs, with
14isolated tests, types and3,692refs. Parent review identified source Box2/3 and
recipient-link consistency gaps; both were reproduced red and corrected before
commit. Fresh immutable full validation follows these integrated packages.
