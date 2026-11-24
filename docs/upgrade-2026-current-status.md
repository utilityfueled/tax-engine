# Current 2026 upgrade status

## Resume here · November 24

Main is the active branch. The hosted cybersecurity rehearsals are
deferred at the owner’s direction. Their readiness criteria remain open.

Read the `resume` entry in the [checkpoint](upgrade-2026-checkpoint.json)
for the exact application revision, current blockers and evidence key.
Use the linked progress sections when investigating individual packages.

- Guided state estimates now retain the confirmed applied tax year.
  A verified prior-year payment is excluded from the current state
  balance and remains available for its actual federal cash year.
  All 396 focused tests passed. [State payment evidence](upgrade-2026-progress.md#november-24-state-estimated-payment-application-years) ·
  [Commit e2d50f12](https://github.com/utilityfueled/tax-engine/commit/e2d50f12ce356d407b7d41c96c23281fbded3c82).

- The exact-source inventory check detected four outdated IRS authority
  links. Regenerating the 1,128-entry inventory corrected them, and the
  inventory check passed. [Inventory evidence](upgrade-2026-progress.md#november-24-generated-inventory-authorities).

- The offline AI scorer now excludes attempts over the task token cap
  from promotion eligibility and retains the exact billed cost.
  All 85 focused tests passed. Live qualification and independent
  evaluation review remain open.
  [Scorer evidence](upgrade-2026-progress.md#november-24-ai-evaluation-attempt-token-caps) ·
  [Commit 076ddaf7](https://github.com/utilityfueled/tax-engine/commit/076ddaf782cd5d80017ce030ab691bd30291319c).

- The current application archive `f3163949` passed all 11 local checks.
  Unit and coverage each passed 30,377 tests with 81 conditional skips
  and 88.31% branches. Chromium passed all 652 active cases with five
  original skips, as did the exact pre-change baseline. The exact
  PostgreSQL CI coverage job passed 30,458 tests at 88.69% branches.
  The code-equivalent [strict ARM64 rehearsal](https://github.com/utilityfueled/tax-engine/actions/runs/45420399946)
  passed image build, smoke, recovery and archive verification. Its
  Chromium suite passed 642 and missed ten Ohio deadlines with five
  original skips. The same ten cases failed in the earlier ARM64 run.

- The [ordinary Linux run](https://github.com/utilityfueled/tax-engine/actions/runs/45417655999)
  on exact `f3163949` built successfully. Strict AMD64 passed 645 cases
  and missed seven Ohio deadlines. Managed Chromium passed 650 and
  missed two RRTA inspections. Both retained five original skips.
  AMD64 recovery, rollback and independent archive verification passed.

- The final 2026 Form 6781 and its embedded instructions are pinned.
  All 73 focused tests passed. Official PDF output still requires source
  rows, elections, statements and qualification of the annual transfers.
  [Form 6781 source receipt](upgrade-2026-form-6781-final-source.md) ·
  [Commit 880704df](https://github.com/utilityfueled/tax-engine/commit/880704df8910c36e77be3aef5b375ab2a347a895).

- Three focused Ohio journeys passed on the archived macOS production
  build. Timed synchronous storage took 0.9–5.0 ms during entries that
  took 1.4–2.8 seconds. Strict Linux storage cost remains unmeasured.
  [Storage timing evidence](upgrade-2026-progress.md#november-24-focused-ohio-browser-storage-timing).

- `fee02a61` pins the final 2026 Form 8801 blank and verifies the eleven
  Part II widgets under a disabled candidate. The form adds no public
  output. Current instructions and final Form 6251 still print 2025.
  [Official source receipt](upgrade-2026-form-8801-final-source.md).

- `bbebe675` skips redundant residency and child source comparisons
  when an Ohio header edit leaves those records untouched. Existing
  source confirmation invalidation is covered by 97 focused tests.
  Strict Linux timing for this change is pending.
  [Ohio reducer evidence](upgrade-2026-progress.md#november-24-ohio-header-source-comparisons).

- `f3163949` describes the actual 2025 Pennsylvania Schedule NRH and
  G-L review downloads on `/support`. All 27 focused tests passed, and
  Vercel skipped the production build.
  [Pennsylvania disclosure evidence](upgrade-2026-progress.md#november-24-pennsylvania-review-disclosure).

- The exact `5f32cf32` archive passed 30,367 unit and coverage tests
  in each run, with 81 conditional skips and 88.31% branches. Build,
  web types, lint and verification of all 9,986 spec test references
  also passed.
  [Exact local checks](upgrade-2026-progress.md#november-24-exact-main-unit-and-coverage-run).

- `33b6a593` adds renderer scheduler observations to the opt-in Linux
  comparison of Ohio journeys. All 116 focused tests and four local
  Chromium cases passed. The exact managed Chromium run passed all 652
  active cases with five original skips. Both focused Linux legs passed
  ten cases each, with about 42 ms median renderer runnable wait in
  each mode. The full strict run passed 646 and missed six Ohio
  deadlines. Its header entry median was 5,238 ms.
  [Scheduler evidence](upgrade-2026-progress.md#november-24-ohio-linux-scheduler-comparison).

- The full Linux comparison on `3f4141fe` recorded 11 Ohio deadline
  failures and two RRTA inspection timeouts in strict AMD64. Managed
  Chromium missed the same two RRTA inspections. Both focused modes
  missed the same six Ohio deadlines. The strict full workload showed more
  renderer CPU time and runnable wait in two usable header samples.
  [Full comparison](upgrade-2026-progress.md#november-24-ohio-linux-scheduler-comparison) ·
  [Current ordinary Linux run](https://github.com/utilityfueled/tax-engine/actions/runs/45417655999).

- `ae399bd1` compares the current and candidate Python versions on the
  same Ubuntu runner with the two exact retained RRTA inputs. Both
  validator suites and all 104 attempts passed. Python 3.14.10 improved
  paired median times by 4.19% and 4.38%, below the 10% threshold.
  That run used Ubuntu 24.04. A repeat on the failed managed job's
  exact Ubuntu 26.04 image revision also passed all 104 inspections
  within 2.06 seconds. The 4.91% improvement at both widths fell
  below the same threshold. [First benchmark](https://github.com/utilityfueled/tax-engine/actions/runs/45406230980) ·
  [Ubuntu 26.04 repeat](https://github.com/utilityfueled/tax-engine/actions/runs/45409802503).

- `a2568205` requires separate actual confirmations for Pennsylvania
  extension and balance payments. Exact unit and coverage runs both passed
  30,364 tests with 81 skips and 88.31% branches. All eight GitHub CI jobs
  passed, including 30,445 coverage tests with 88.69% branches. Strict
  AMD64 passed 646 browser cases and missed six Ohio deadlines. Managed
  Chromium passed 650 and missed two RRTA saved-PDF inspection deadlines.
  Both retained five original skips. Recovery, rollback, archive
  verification and the image scan passed. Both managed RRTA inputs
  passed the original inspection limit when replayed on macOS. The
  managed and local decoded streams differed only in two timestamps.
  [Balance evidence](upgrade-2026-progress.md#november-24-pennsylvania-balance-receipt-confirmations) ·
  [RRTA input comparison](upgrade-2026-progress.md#retained-rrta-input-comparison).

- `4ee0721b` reports verified Pennsylvania extension receipts before the
  due date in the 2025 review methods and the 2026 state-only draft when
  independently established tax coverage permits. The 2026 draft keeps
  the full withholding and refund reconciliation requirements in all three
  residency paths. The exact source passed 30,363 unit tests with 81 skips,
  88.31% local branch coverage and all six selected Pennsylvania Chromium
  journeys. Eight GitHub CI jobs passed. The strict AMD64 run passed 648
  cases and missed four Ohio deadlines with five original skips.
  Managed Chromium passed 650 cases and missed two saved-PDF inspection
  deadlines with the same original skips. Native ARM64 on the equivalent
  application source `d439de12` passed 642 cases and missed ten Ohio
  deadlines with five original skips. Recovery and archive verification
  passed in both strict runtime rehearsals.
  [Payment evidence](upgrade-2026-progress.md#november-24-pennsylvania-extension-receipts).

- `924c3545` pins the refreshed official Node base. AMD64 and ARM64 inherit
  Debian's fixed glibc and zlib packages. PPC64LE and S390X retain their
  pinned zlib install. The four published images were inspected by digest.
  All 11 local checks passed, including 30,351 tests, 88.30% branch coverage
  and 652 active Chromium cases. All eight GitHub CI jobs passed, including
  30,432 coverage tests at 88.68%. The exact Docker build, smoke and Compose
  recovery passed on both release architectures. Managed Linux passed all
  652 active Chromium cases. Strict AMD64 passed 646 browser cases and missed
  six Ohio deadlines. Strict ARM64 passed 643 and missed nine Ohio deadlines.
  Independent archive verification, scan and cleanup passed on both. Each
  image reported 192 advisory matches, including 70 high and zero critical.
  The two prior fixable high glibc findings were absent. Applicable residual
  advisories still require release dispositions.
  Vercel skipped the production build.
  [Image refresh evidence](upgrade-2026-progress.md#november-24-node-base-image-refresh).

- The six failing AMD64 Chromium traces now have matched local traces.
  The standard wrapper passed all 14 targeted Ohio journeys locally in two
  request windows with the original 30-second deadlines and no retries.
  Remote delays accumulated during native field entry and later review actions.
  The local Chromium profile did not isolate a Linux application bottleneck.
  [Ohio timing evidence](upgrade-2026-progress.md#november-24-paired-ohio-browser-traces).

- `edb68f0e` excludes future-dated evidence from offline AI evaluation
  reports. The isolated source passed 105 focused tests and 18 additional
  diagnostic checks. Independent human labels and comparable live runs
  remain open. [Evaluation evidence](upgrade-2026-progress.md#november-24-offline-ai-evaluation-report-time).

- Combined verification at `26348f19` passed all 11 local checks, including
  30,351 tests in both runs, 88.30% branch coverage and all 652 active Chromium
  cases. The exact Docker build and all eight GitHub CI jobs passed, with
  30,432 coverage tests at 88.68%. The managed GitHub job stopped
  before Chromium at the old timing pin. `8fa8ab22` corrects the pin and passed all 53
  preflight tests on Node 26 with independent engineering review. Its Docker
  build, eight GitHub CI jobs and all 652 active managed Linux Chromium cases
  passed. Vercel skipped its production build.
  [Exact image build](https://github.com/utilityfueled/tax-engine/actions/runs/45367064051) ·
  [Corrected browser workflow](https://github.com/utilityfueled/tax-engine/actions/runs/45369760238).

- `723248b7` collects documented use of an ordinary long-term tangible
  gift to an actual 50%-limit organization. A $500 gift with $100 basis
  sold by the charity to raise funds now uses $100. The isolated source
  passed 887 focused tests and 35 Chromium cases. The combined local
  verification passed at `26348f19`. Vercel skipped its build.
  [Tangible gift evidence](upgrade-2026-progress.md#november-24-documented-use-of-tangible-charitable-gifts).

- `c2b05a1c` distinguishes a gross payment from an already-net charitable
  cash amount in the guided interview. A $70 payment with a $40 benefit
  produces a $30 contribution. The package passed 650 focused tests and
  38 Chromium cases on the isolated source. The combined local checks
  passed at `26348f19`. Final qualification requires qualified review.
  [Cash gift evidence](upgrade-2026-progress.md#november-24-cash-gifts-with-return-benefits).

- `9a45b970` adds a private Pennsylvania 2026 worksheet path that
  excludes verified government unemployment from state income and
  Schedule SP for residents, part-year residents and nonresidents. All
  2,539 Pennsylvania tests passed. All 11 exact local checks passed,
  including 30,338 tests at 88.32% branch coverage and 650 active
  Chromium cases. All eight GitHub CI jobs passed with 30,419 coverage
  tests and 88.70% branch coverage. Managed Linux passed all 650 browser
  cases. The image build and ARM64 recovery passed.
  Strict ARM64 passed 640 browser cases and missed 10 Ohio deadlines.
  Strict AMD64 passed 637 and missed 11 Ohio browser deadlines and two
  RRTA saved-PDF inspection deadlines. A later strict sample passed 648
  and missed two deadlines. GitHub returned HTTP 403 for the optional
  phase measurements.
  [Pennsylvania evidence](upgrade-2026-progress.md#november-24-pennsylvania-government-unemployment-exclusion).

- `badcfd4b` adds an internal Ohio 2026 candidate that assigns ordinary
  unemployment receipts for a single part-year resident or nonresident.
  All 2,441 Ohio tests passed, including 29 new cases. Full local unit and
  coverage runs each passed 30,319 tests at 88.32% branch coverage. Final
  Ohio forms and qualified review remain open.
  [Ohio evidence](upgrade-2026-progress.md#november-24-ohio-unemployment-for-part-year-residents-and-nonresidents).

- `355d3fec` adds a private wage source path for a short return due before
  the calendar W-2 arrives. It reconciles one employer's complete dated
  payroll ledger to an independently identified issuer cutoff summary.
  The latest exact focused checks passed. Qualified tax review and final
  reporting remain open.
  [Cutoff evidence](upgrade-2026-progress.md#november-24-employer-cutoff-payroll-originals).

- `703c0a1d` supplies the internal wage-only worksheet with dated payroll
  amounts that reconcile to an original calendar-year W-2. It handles the
  short-period cutoff for payments available before collection. This
  source method applies after the calendar-year W-2 is available.
  [Payroll evidence](upgrade-2026-progress.md#november-24-actual-short-year-payroll-sources).

- `bc2fb70f` implements the internal Section 443 worksheet for ordinary
  regular and minimum tax. It uses separate short-period bases and keeps
  half-dollar ties exact. `924a46bc` adds the worksheet to the generated
  coverage inventory. Exact unit and coverage runs each passed 30,283
  tests at 88.30% branch coverage, and exact local Chromium passed all
  650 active cases. Public output still requires qualified tax review and
  final form mapping.
  [Arithmetic evidence](upgrade-2026-progress.md#november-24-ordinary-short-accounting-year-tax).

- `c5c11f1a` carries the CLI’s actual short-year answer into the same
  Section 443 hold as object input and the guided interview. It validates
  the new optional file and rejects misspelled facts. All 34 focused
  tests and five actual CLI cases passed. `71a2c6e6` binds the browser
  audit to the reviewed loader, and `35d69e98` updates the dependent
  diagnostic checksum. Exact unit and coverage runs each passed 30,276
  tests at 88.30% branch coverage. All eleven exact local checks passed,
  including 650 active Chromium cases. The GitHub Docker job also passed.
  Managed Linux passed 648 active cases and reached two RRTA saved-PDF
  inspection deadlines. All eight GitHub CI jobs passed. Strict AMD64
  passed 635 active cases and reached fifteen browser deadlines. Its
  Compose recovery, independent archive, scan and cleanup passed.
  [CLI evidence](upgrade-2026-progress.md#november-24-cli-short-accounting-year-import).

- `cee016b0` lets a living single filer save actual dates for a regular
  month-end accounting-period change. Incomplete and confirmed drafts
  survive encrypted recovery. The dates and reference stay out of PDF
  and provider requests. Annualized amounts still require a qualified
  calculation. All eleven exact local checks, all eight GitHub CI jobs
  and all 650 active managed Linux cases passed. Strict AMD64 passed
  recovery and archive verification and reached two browser deadlines.
  ARM64 passed recovery and archive verification and reached nine browser
  deadlines. The strict AMD64 repeat passed recovery and archive checks
  and reached seventeen browser deadlines across Ohio, Pennsylvania and RRTA.
  [Intake evidence](upgrade-2026-progress.md#november-23-actual-short-accounting-period-intake).

- `0c33f925` holds the public federal API and workspace recompute for a
  confirmed accounting-period change. The CLI and guided app use the same
  admission rule. Two tests reproduced unsupported amounts before the fix,
  and 216 scoped tests passed afterward. All 11 exact local checks passed
  with 88.28% branch coverage and 650 active Chromium cases. The exact
  Docker build and all eight GitHub CI jobs passed. Strict AMD64 and ARM64
  passed recovery and archive checks. Their browser suites reached
  thirteen and nine existing deadlines. Section 443 annualization
  remains open. Vercel canceled the production build.
  [Public calculation evidence](upgrade-2026-progress.md#november-23-public-federal-calculation-admission).

- `546de14a` drops one redundant Ohio source replay while the school
  district draft is awaiting confirmation. Federal metrics, Ohio validation
  and the standalone preview match their prior behavior. Independent
  review, 140 scoped tests and ten Chromium cases passed. The combined
  exact release checks use `0c33f925`.
  [Ohio render evidence](upgrade-2026-progress.md#november-23-pending-ohio-school-district-replay).

- `caa601bf` holds whole-return estimates, official review PDFs and
  verified AI amounts when an actual change in accounting period requires
  annualization. Four red checks reproduced the erroneous outputs.
  All 11 exact local checks passed, with 30,259 unit tests, 88.28% branch
  coverage and 650 active Chromium cases. GitHub CI passed eight jobs,
  including 30,340 coverage tests at 88.66%. Managed Linux also passed all
  650 active cases. The §443 computation needs period facts and a qualified
  calculation method.
  [Accounting-period gate evidence](upgrade-2026-progress.md#november-23-whole-return-short-accounting-period-admission).

- `21f7fd27` names the state return being prepared and explicitly asks
  for Pennsylvania residency in the source form. Nineteen focused tests,
  six desktop/mobile Chromium checks and the exact web build passed.
  [State selection evidence](upgrade-2026-progress.md#november-23-pennsylvania-state-return-wording).

- `c066ab20` verifies the cumulative AI spending bound under the owner
  lock before a second provider attempt. Insufficient holds finalize the
  first attempt, and retries return the same fallback. All 173 focused
  tests passed against disposable PostgreSQL and a fake provider.
  [Accounting and verification record](upgrade-2026-progress.md#november-23-exact-ai-escalation-hold).

- `8b1dbe36` holds a positive federal carry credit when a sole taxpayer
  reports that no preceding return was filed. `67bea8b6` holds a Schedule H
  FUTA No when verified nonexempt cash wages make a qualifying quarter
  unavoidable. All 53 and 307 focused tests respectively passed.
  [Payment and payroll results](upgrade-2026-progress.md#november-23-payment-and-payroll-source-reconciliation).

- `2141344d` adds an independently reviewed native browser timing report
  with case durations, original deadlines, and source and image identity.
  The combined run passed Compose recovery and hit ten Ohio browser
  deadlines. The exact latest AMD64 and ARM64 runs both passed smoke,
  Compose recovery, independent archive verification and cleanup. Their
  strict browser suites each recorded ten deadline failures. Self-host
  qualification remains open.
  [Combined timing report](https://github.com/utilityfueled/tax-engine/actions/runs/45308354506) ·
  [Exact AMD64](https://github.com/utilityfueled/tax-engine/actions/runs/45314151484/job/138176802121) ·
  [Exact ARM64](https://github.com/utilityfueled/tax-engine/actions/runs/45314287203/job/138188946148).

- `ee9a728d` disallows child, other dependent, additional child and earned
  income credits for an actual short accounting-period year. Ordinary
  decedent eligibility is preserved. The 2025 review PDF clears the
  affected dependent credit checkboxes. All 241 focused tests, 55 browser
  orchestration and source-accounting tests, and 28 spec references passed.
  The exact unit suite passed 30,248 tests.
  [Authority and exact-source verification](upgrade-2026-progress.md#november-23-credits-on-a-short-accounting-year).

- `a90b1242` preserves cents through the SALT phase-down, statutory
  floor, and married-separate division for 2025 and 2026. Exact-source
  local unit and coverage runs each passed 30,237 tests. Branch coverage
  was 88.29%, and Chromium passed 650 cases with five expected skips.
  The official 2026 Form 8960 draft and current regulation give different
  Section 68 allocation methods.
  That method still requires authority reconciliation and review.
  [SALT and Form 8960 evidence](upgrade-2026-progress.md#november-23-salt-rounding-and-form-8960-authority).

- `ffc9b3d5` requires actual cohabitation in the 2026 separate-return
  Social Security worksheets, including the relevant earlier year for a
  lump-sum election. `e3b3b2bd` reconciles documented timely Marketplace
  premiums reported as zero for an ordinary single policy while preserving
  the original statement. All 209 and 219 focused tests respectively passed.
  Final 2026 Publication 915 is available. The annual calculation and export
  gates remain closed. [Source and test evidence](upgrade-2026-progress.md#november-23-social-security-marketplace-and-native-release-evidence).
- `5380da8c` adds candidate-bound native ARM64 scan evidence, using the
  same workflow as AMD64. All 101 focused tests passed. Exact `e3b3b2bd`
  passed all 11 local checks, with 30,230 unit tests, 88.29% branch
  coverage and 650 Chromium passes. The exact GitHub Docker build also
  passed. The preceding native ARM64 run completed all eight browser
  batches and cleanup, with 640 passes, five expected skips and ten Ohio
  case deadlines. Strict Linux image qualification remains open.
  [Exact AMD64 runtime](https://github.com/utilityfueled/tax-engine/actions/runs/45298543169) ·
  [Exact ARM64 recovery](https://github.com/utilityfueled/tax-engine/actions/runs/45299047812).
- The first managed job stopped at the pre-Chromium Web workflow hash.
  The test now pins the reviewed scanner extraction, and all 53 standalone
  Node timing-contract tests passed locally. The managed rerun is required.
  [Managed job evidence](https://github.com/utilityfueled/tax-engine/actions/runs/45298543169/job/138124985292).

The November 24 source refresh found final annual returns for 2025 at
the IRS, Ohio and Pennsylvania. The IRS still labels its 2026 Form 1040
a draft. The annual calculation and export gates remain closed.
[IRS Form 1040](https://www.irs.gov/pub/irs-pdf/f1040.pdf) ·
[IRS 2026 draft](https://www.irs.gov/pub/irs-dft/f1040--dft.pdf) ·
[Ohio IT 1040 bundle](https://dam.assets.ohio.gov/image/upload/tax.ohio.gov/forms/ohio_individual/individual/2025/1040-bundle.pdf) ·
[Pennsylvania forms](https://www.pa.gov/agencies/revenue/resources/tax-types-and-information/personal-income-tax).

Ohio’s IT NRC index still ends at 2025. Pennsylvania still links the
2025 PA-40 and the standing Schedule NRH, revision 03-24. A verified
2026 annual parent return is needed for the selected residency paths.
[Ohio IT NRC](https://tax.ohio.gov/individual/file-now/IT-NRC-Forms) ·
[Pennsylvania apportionment](https://www.pa.gov/agencies/revenue/resources/tax-types-and-information/personal-income-tax/nonresidents-and-part-year-residents).

- `045a1d08` lets qualifying 2026 married-separate filers save and reopen
  actual living-apart facts for Form 2441 Part II without dependent-care
  benefits. It requires current-year confirmation. All 267 focused tests
  passed. `2eb8088d` applies the Form 8839 limit once per known child in
  2025 and 2026. All 150 focused tests passed. Both changes passed independent
  code review. The annual 2026 calculation and export gates remain closed.
  [Dependent-care and adoption evidence](upgrade-2026-progress.md#november-23-dependent-care-and-adoption-source-facts).
- All 11 local checks passed on exact `2eb8088d`, including 30,207 unit tests,
  88.29% branch coverage, and 650 Chromium tests. Docker passed remotely.
  GitHub CI and runtime were still running at local signoff.
  [Combined revision evidence](upgrade-2026-progress.md#november-23-dependent-care-and-adoption-source-facts).
- `6bbc2f3c`, `e91dc09f` and `f50e6261` reconcile 2026 education identity against the same
  taxpayer or spouse on the saved return and in the calculator. The change
  holds a positive claim with contradictory timely-TIN and employment-valid
  SSN facts. It also preserves eligibility when the other spouse meets the
  SSN requirement and the student has a verified timely TIN. The adult
  student's explicit TIN requirement remains in force. All 861 focused tests
  passed. The annual 2026 calculation and export gates
  remain closed. [Form 8863 evidence](upgrade-2026-progress.md#november-23-education-student-identity-and-ohio-render-verification).
- `add12647` skips one redundant state-source replay per eligible pending
  2025 single-filer Ohio resident-credit render. Federal preview, saved
  facts, school and header paths, and independent state validation have
  regression coverage. All 31 focused tests passed. Linux deadline
  qualification requires exact image evidence.
  [Ohio render evidence](upgrade-2026-progress.md#november-23-education-student-identity-and-ohio-render-verification).
- All 11 local checks passed on exact `f50e6261`, including 30,197 unit tests,
  88.29% branch coverage, and 650 Chromium tests. Docker passed remotely.
  GitHub CI and runtime were still running at local signoff.
  [Exact revision evidence](upgrade-2026-progress.md#november-23-education-student-identity-and-ohio-render-verification).

- `c819ad3b` keeps each Form 8995-A business's wage, property basis and
  service-business facts with its original record. A name-only aggregation
  election requires review when two source records share its component name,
  including K-1 records with zero current QBI. Five regressions failed on the
  previous revision and 647 focused tests passed with the fix. Independent code
  review passed. All 11 exact local checks, GitHub CI, Docker and managed Linux
  browser flows passed. Strict AMD64 passed Compose recovery and archive
  verification and hit 11 Ohio case deadlines and two RRTA inspection
  deadlines. The 2026 regression uses the internal draft calculation.
  [Source-matching evidence](upgrade-2026-progress.md#november-23-form-8995-a-business-source-matching).

- `1dd593b5` binds nonjoint public safety officer premiums to the
  otherwise taxable amount on their own Form 1099-R. Positive claims
  with conflicting complete payer TINs in a single Simplified Method
  group require review. `e097ec35` shows an incomplete estimated-payment
  total when a started row has a missing or invalid amount and displays
  confirmed zero as $0. The two packages passed 1,815 and 27 scoped
  tests respectively. Native ARM64 on `1dd593b5` passed 643 browser
  cases and reached seven Ohio deadlines. Image smoke, Compose
  recovery and independent archive verification passed.
  [Matched statements and payment display](upgrade-2026-progress.md#november-23-matched-pension-statements-and-estimated-payment-display).

- `0c24c408` allows a fully measured AI baseline to be compared when
  its only rejected responses otherwise satisfy every acceptance
  criterion and an independent human explicitly rejects their quality.
  The baseline still records those rejections. All 73 scoped tests
  passed. The combined revision passed all 11 local checks, with
  30,184 tests per unit and coverage suite, 88.27% branch coverage
  and all 650 active local Chromium cases. All eight GitHub CI
  jobs passed, with 30,263 coverage tests and 88.63% branch
  coverage. Independent human corpus and output reviews and live
  model qualification remain open.
  Strict AMD64 passed 646 cases with four Ohio part-year case
  deadlines. Image smoke, Compose recovery, archive verification and
  both SBOM formats passed. Managed Linux passed 648 cases and hit
  two saved-PDF inspection deadlines for RRTA.
  [Offline AI comparison](upgrade-2026-progress.md#november-23-offline-ai-quality-comparison).

- `45340a4e` applies the $3,000 public safety officer exclusion cap
  separately to each eligible spouse. Joint claims require actual
  spouse and statement ownership facts. The upgrade holds ambiguous
  grouped basis and retains the guided election review gate. All 1,805
  scoped tests, 61 independent checks and 86 spec references passed.
  At `9df3b108`, all 11 exact local checks, full GitHub CI and the
  Docker build passed. GitHub coverage ran all 30,249 tests at 88.63%.
  Managed Linux passed 650 browser cases. Strict AMD64 passed 635
  and hit 15 existing deadlines. Native ARM64 passed 641 and hit nine.
  Image smoke, Compose recovery and archive verification passed on
  both. The AMD64 job generated both candidate-bound SBOM formats.
  Vercel canceled the production build.
  [Joint cap evidence](upgrade-2026-progress.md#november-23-joint-public-safety-officer-exclusion).
- `3e9fbee4` updates the browser diagnostic audit fingerprint.
  `95ee42c0` verifies that both unit shards use the exact inherited
  Node and PostgreSQL setup. The previous full run found three stale
  source assertions. All 48 focused tests and independent review passed
  after the corrections. All nine exact local core checks passed.
  Unit and coverage each passed 30,162 tests with 79 existing skips
  and 88.26% branch coverage. The application-equivalent browser run
  passed all 650 runnable cases. GitHub Docker passed and Vercel
  canceled the production build. Full GitHub CI passed, with 30,241
  coverage tests and 88.63% branch coverage. Managed Linux passed
  650 browser cases. Strict AMD64 passed 645 and hit five Ohio case
  deadlines. The earlier application-equivalent native ARM64 run passed
  640 and hit ten Ohio case deadlines. Recovery, image archive and cleanup
  passed on both strict platforms.
  [Latest CI](https://github.com/utilityfueled/tax-engine/actions/runs/45243150390) ·
  [Retirement draft ARM64](https://github.com/utilityfueled/tax-engine/actions/runs/45242081974).
- `e0ecb6c9` labels Box 2a as the payer's statement amount and
  distinguishes missing Box 2a or Box 4 from an entered zero. The
  saved affirmative premium election remains held. All 71 adjacent
  tests, 62 spec references, web types, inventory, lint and browser
  source audit passed.
  [Review evidence](upgrade-2026-progress.md#november-23-retirement-draft-source-amounts).
- `f49a9fb8` distributes the GitHub unit suite across two runners
  while keeping the `Unit Tests` check. Both local shards passed all
  30,161 runnable tests with 79 existing skips and no overlap across
  2,209 files. Docker passed. The original hosted shards failed and
  the aggregate reported failure. The corrected revision is running.
  [GitHub CI](https://github.com/utilityfueled/tax-engine/actions/runs/45239551695).
- `d164d0ca` requires an explicit answer about the public safety officer
  premium exclusion on a 2026 Code 3 pension. An affirmative answer goes
  to qualified review, and older unanswered worksheets hold. Independent
  review and 46 final scoped tests passed. All 11 exact local checks passed,
  including 30,161 tests in each core run, 88.25% branch coverage and
  650 Chromium cases. The Docker build, Linux and ARM64 recovery, and
  independent archive checks passed. Managed Linux hit two RRTA inspection
  deadlines. Strict Linux and ARM64 hit three and nine Ohio deadlines,
  respectively. GitHub coverage passed all 30,240 tests at 88.62% branch
  coverage. The single-worker unit job canceled at its 60-minute limit.
  Vercel canceled the production build.
  [Election evidence](upgrade-2026-progress.md#november-23-code-3-public-safety-officer-election).
- The sandbox Checkout Session from `522cf4b1` expired unpaid without a
  PaymentIntent or subscription. This closes the expiry observation.
  Successful checkout, signed delivery and credit effects remain open.
  [Sandbox expiry evidence](upgrade-2026-progress.md#november-23-stripe-sandbox-checkout-expiry).
- `ec186160` captures one documented 2026 employer disability pension
  payment before the recipient’s minimum retirement date. It holds
  missing and mismatched records, and leaves the annual gates closed.
  All 2,216 adjacent tests, the scoped spec check, root and web typechecks,
  and independent software review passed. `af43b507` and `3fbbd41c`
  refresh the inventory and browser source pins. Vercel canceled the
  `3fbbd41c` production build. That revision passed 650 local browser
  cases with five existing skips. Qualified tax review is still required.
  [Disability pension evidence](upgrade-2026-progress.md#november-23-guided-form-1099-r-disability-pension).
- The exact `b59f68b1` Linux comparison passed 637 strict container
  cases, failed 13 and retained five original skips. On the same AMD64
  runner, the focused 10 Ohio cases passed four and failed six in each
  runtime. The normal managed full-suite job passed on a separate runner.
  The comparison leaves the strict browser qualification open.
  [Linux workflow](https://github.com/utilityfueled/tax-engine/actions/runs/45108772468).
- `16af26be` preserves the distinction between a blank and a reported
  zero in Box 5 for a 2026 primary Code 1 IRA. `95c40f61` renders
  the internal 2026 Form 5329 Code 08 review candidate. Physical
  inspection verified lines 1–4, the review notice on all three pages
  and omission of the name, SSN and source identifiers. Independent
  software review and all 11 exact local checks passed, with 30,156
  tests in each core suite, 88.25% branch coverage and 650 Chromium
  passes. All six GitHub CI jobs, Docker, isolated Compose recovery
  and independent archive verification passed. Both Linux browser
  modes passed 648, failed two and retained five skips. Strict failed
  two Ohio school district cases. Managed failed two RRTA saved-PDF
  checks.
  [Form 5329 PDF evidence](upgrade-2026-progress.md#november-23-internal-form-5329-tuition-pdf).
- `2e373906` adds a guided 2026 tuition exception worksheet.
  `b406c579` restores the historical aggregate Form 5329 defaults and
  validates the tuition source separately. The unchanged joint HSA control
  returns $84. Actual Chromium-captured records replay to Code 08, line 2
  of $2,000.15 and line 4 of $100.03 with test-only annual values.
  Independent software review and all 11 exact local checks passed.
  Each core suite passed 30,152 tests, with 88.24% branch coverage and
  650 Chromium passes.
  [Form 5329 tuition evidence](upgrade-2026-progress.md#november-23-form-5329-tuition-records).
- `af96bd3a` carries one matched 2025 Pennsylvania NRK-1 partnership
  original into the ordinary full-year nonresident calculation. Local
  Chromium reopened the supported return, verified the original attachment
  hold, and replayed saved facts to PA-40 lines 4 and 17. All 44 focused
  tests, 24 scoped spec references, and independent software review passed.
  All 11 exact local checks passed, with 30,140 tests in each core suite,
  88.23% branch coverage, and 650 Chromium passes.
  [Pennsylvania partnership evidence](upgrade-2026-progress.md#november-23-pa-nonresident-partnership-original).
- `80fb4d9c` binds one matching 2024 issuer payment and one matching
  2025 payment to an exact combined line 4 reduction. All 93 focused
  tests, 47 scoped spec references, root and web types, and independent
  software review passed. Chromium verified save, reopen, and recovery
  from a mismatched second issuer. All 11 exact local checks passed,
  with 30,136 unit and coverage cases per suite, 88.22% branch coverage,
  and 650 Chromium passes. On application-equivalent `fd67b598`, all six
  GitHub CI jobs, Docker and managed Chromium passed. Strict AMD64 and
  ARM64 each passed 640 cases, failed 10 and retained five existing skips.
  Native image smoke, Compose recovery and independent archive verification
  passed. The strict browser gate remains open.
  [Paired Form 8880 evidence](upgrade-2026-progress.md#november-22-paired-form-8880-issuer-records).
- `e728b7b3` keeps an education refund-history answer editable after
  formatting or clearing a zero entry, and exposes the question when an
  expense has a linked refund. All 14 focused tests, web typecheck, six
  scoped spec references and independent software review passed. All
  11 exact local checks passed, with 30,131 unit and coverage cases per
  suite, 88.22% branch coverage, and 650 Chromium passes.
  [Education refund evidence](upgrade-2026-progress.md#november-22-education-refund-zero).
- `00134fa3` accepts one matching 2024 or 2025 Form 1099-R and issuer
  receipt in the guided 2026 Saver’s Credit path. All 88 focused tests
  and independent software review passed. Chromium saved and reopened
  $500.37 and blocked both directions of a year mismatch. All 11 exact
  local checks passed, with 30,130 unit and coverage cases per suite,
  88.22% branch coverage, and 650 Chromium passes.
  [Historical IRA evidence](upgrade-2026-progress.md#november-22-form-8880-2024-issuer-records).
- `83436988` reuses the exact federal result during one pending Ohio
  part-year header replay. Both source checks and the original proof
  still run. Independent software review and all 11 exact local checks
  passed, with 30,125 cases per core suite, 88.21% branch coverage and
  650 Chromium passes. Local timings improved 1.55–4.02 ms per edit.
  Strict Chromium passed 637 with 13 failures on AMD64 and 640 with 10
  failures on native ARM64. Each retained five existing skips. Image
  smoke, recovery, archive verification and cleanup passed on both.
  The failures reconcile to 11 Ohio case deadlines and two RRTA
  saved-PDF inspection timeouts on AMD64 and 10 Ohio case deadlines on
  ARM64. Runtime qualification remains open.
  [Ohio preview evidence](upgrade-2026-progress.md#november-22-ohio-pending-header-federal-reuse) ·
  [AMD64](https://github.com/utilityfueled/tax-engine/actions/runs/45092257157) ·
  [Native ARM64](https://github.com/utilityfueled/tax-engine/actions/runs/45093267293).
- `ed2cafdb` collects the historical IRA evidence in the 2026 Single
  Credits worksheet. Private Chromium verified save and reopen,
  confirmation invalidation and correction of a mismatched issuer.
  Independent software review and all 11 exact checks passed, with
  30,121 cases per core suite, 88.21% branch coverage and 650 Chromium passes.
  [Guided Form 8880 evidence](upgrade-2026-progress.md#november-22-guided-form-8880-historical-evidence).
- `550139f5` validates one 2025 traditional IRA distribution for a single
  2026 filer. It matches the historical statement and payment record,
  keeps the amount outside current-year income, and ties the internal
  Roth review PDF to Schedule 3. Focused checks and independent software
  review passed. All 11 exact checks passed with 30,118 tests per core
  suite, 88.21% branch coverage and 650 Chromium passes. Manually
  affirmed totals remain supported and the public gate is closed.
  [Form 8880 prior-year receipt](upgrade-2026-progress.md#november-22-form-8880-prior-year-ira-receipt).
- `648ba271` uses the same 2026 IRA basis ratio in Form 8606 and its
  internal review PDF. An isolated joint-return fixture now carries the
  primary owner's $1 taxable amount to Form 1040 line 4b. Focused checks
  and independent software review passed. All 11 exact local checks
  passed, with 30,115 tests per core suite, 88.21% branch coverage and
  650 Chromium passes. The annual gate stays closed.
  [Form 8606 parent transfer](upgrade-2026-progress.md#november-22-form-8606-parent-transfer).
- `931d088f` reconciles the disabled Form 8606 specimen when three
  fractional digits would overuse basis. The pinned PDF reopened with
  `0.9999` and $1 taxable in the $9,999 basis fixture. The larger
  overuse case remains held. `77b5ae7c` refreshes the browser source
  audit. All 11 exact local checks passed, with 30,113 cases per core
  suite, 88.21% branch coverage and 650 Chromium passes. The exact
  GitHub Docker build, six CI jobs and managed browser job passed. The
  strict browser step failed. Recovery, archive import and removal passed.
  [Form 8606 evidence](upgrade-2026-progress.md#november-22-form-8606-native-ratio-precision).
- The optional Ohio timing report adds header entry and first header
  confirmation. Four audited Chromium cases and all five live timing
  markers in a separate local opt-in passed. The exact `7f1a0ee6` Linux
  strict run passed 636, failed 14 and retained five existing skips.
  In both optional legs, three of four school cases stopped during
  header entry. The fourth passed header confirmation and stopped
  later. Runtime qualification remains pending.
  [Ohio timing evidence](upgrade-2026-progress.md#november-22-ohio-header-phase-measurement) ·
  [Exact Linux replay](https://github.com/utilityfueled/tax-engine/actions/runs/45083783740).
- `3aefc04c` holds the disabled internal Form 8889 review PDF when
  rounded line 16 contradicts the displayed subtraction. The exact
  engine amount and current public gates are preserved. Reopened
  controls and independent software review passed. All 11 local checks
  passed, with 30,111 unit and coverage cases per suite and 88.21%
  branch coverage. Chromium passed 650 cases with five existing skips.
  All six exact GitHub CI jobs passed, with 88.58% branch coverage.
  GitHub built the Docker image on the application-equivalent documentation revision.
  Managed Linux passed 649 browser cases, with one railroad saved-PDF
  inspection timeout. The strict AMD64 image passed smoke, recovery,
  archive import and cleanup. Its browser run passed 641 with nine Ohio
  deadlines. Both remote browser runs retained five existing skips.
  [Form 8889 evidence](upgrade-2026-progress.md#november-22-form-8889-displayed-line-reconciliation) ·
  [Exact CI](https://github.com/utilityfueled/tax-engine/actions/runs/45075939078) ·
  [Exact Web run](https://github.com/utilityfueled/tax-engine/actions/runs/45075939075) ·
  [Docker build](https://github.com/utilityfueled/tax-engine/actions/runs/45076191539).
- `c6ea35ac` removes a duplicate Ohio payment projection within each
  invocation. Four complete projections matched before and after, and
  all ten scoped Chromium cases passed. All 11 local checks passed
  with 30,109 unit and coverage cases per suite, 88.21% branch coverage,
  and 650 Chromium passes with five existing skips. ARM64 passed
  smoke, independent archive import, recovery and cleanup. Its browser
  run passed 639, with 11 Ohio deadlines and five existing skips.
  Strict AMD64 passed 637 browser cases with 13 failures and five existing
  skips. In the optional replay, all four part-year school cases cleared
  first confirmation and reached the deadline before review download. See
  `activeContinuation.nov22OhioPaymentProjectionReuse`.
  [Ohio evidence](upgrade-2026-progress.md#november-22-ohio-payment-projection-reuse) ·
  [AMD64 timing](https://github.com/utilityfueled/tax-engine/actions/runs/45074918225) ·
  [ARM64 recovery](https://github.com/utilityfueled/tax-engine/actions/runs/45075193188).
- `a79ff3d0` aligns Pennsylvania State Return navigation with payment
  reconciliation for the implemented 2025 single resident, part-year and
  nonresident methods. All three Chromium cases passed. See
  `activeContinuation.nov22PASavedEstimateNavigation`.
  [Pennsylvania evidence](upgrade-2026-progress.md#november-22-pennsylvania-saved-estimate-navigation).
- The exact `1da09dc8` unit and coverage suites passed 30,103 each,
  with 79 existing skips and 88.21% branch coverage. It changes only a
  NEW212 timing test relative to application `2519ff1c`.
- `2519ff1c` requires fresh annual student-loan interest payment and
  dependency answers after a known year changes. Focused and independent
  checks passed, including all three local Chromium regressions. Vercel
  recorded its production build as canceled. See
  `activeContinuation.nov22StudentLoanYearFacts` for exact evidence.
  [Student-loan evidence](upgrade-2026-progress.md#november-22-student-loan-annual-payment-and-dependency) ·
  [Exact Web run](https://github.com/utilityfueled/tax-engine/actions/runs/45070994820).
- `f6ef1045` passed all 11 local checks, 30,099 unit and coverage cases
  per run, 88.20% branch coverage against the 85% gate, and 650 Chromium
  cases with five existing skips. Managed Linux matched the browser
  outcome. The strict image passed Compose recovery and cleanup. Its
  browser run passed 636 cases, failed 14 and retained five skips.
  [Exact Linux run](https://github.com/utilityfueled/tax-engine/actions/runs/45059367288).
- `55488dcb` restored the pinned Python prerequisite to the optional
  Ohio timing comparison. Strict AMD64 passed 645 and failed five with
  five existing skips. The paired legs passed 10 and 12 of 15, with
  timeout-only failures. `c446a6c1` adds school entry timing to the next
  eligible replay. Neither result qualifies the strict runtime.
  [Pinned-interpreter run](https://github.com/utilityfueled/tax-engine/actions/runs/45067567954) ·
  [Timing evidence](upgrade-2026-progress.md#november-22-ohio-school-phase-timing).
- [Open external actions](upgrade-2026-external-actions.md) tracks the
  remaining annual publications, qualified human reviews and release
  rehearsal. Cybersecurity work is deferred at the user's direction.
  Release qualification remains open.

## Latest exact release verification

`13cf80f4` aligns two Form 2441 interaction assertions with the annual
confirmation prompt. All 51 focused tests passed. On `ebc5a6b1`, managed
Linux passed 650 cases. The strict image passed recovery and archive
import. The browser run passed 637 cases with 13 failures and five
original skips. The performance replay left the cause of the resident-credit
wall-time gap unresolved.
[Strict Linux and care selector evidence](upgrade-2026-progress.md#november-22-strict-linux-timing-and-care-selector-verification).

`41b7073c` binds the runtime source contract to the reviewed font
dependency lock. GitHub unit and coverage each passed 30,099 tests,
with 88.58% branch coverage. Docker and managed Linux passed. Strict
AMD64 passed smoke, recovery and archive import. Its browser run
passed 643 cases with seven Ohio deadlines and five original skips.
[Exact CI](https://github.com/utilityfueled/tax-engine/actions/runs/45029369695) ·
[Exact browser results](https://github.com/utilityfueled/tax-engine/actions/runs/45029369654).

`d078258a` preserves supported Unicode names in the disabled Form 2106
review candidate. All 85 scoped tests passed, and strict reopening and
rendering verified the native field. The separate font dependency package
is `11efa4a1`.
[Form 2106 evidence](upgrade-2026-progress.md#november-22-form-2106-native-name-rendering).

`9992e601` holds the disabled 2026 Form 8919 Reason H review candidate
when the reclassified amount could also appear in active NEC or MISC
income. All 102 scoped tests and seven spec references passed.
[Form 8919 evidence](upgrade-2026-progress.md#november-22-form-8919-reason-h-income-reconciliation) ·
[Browser timing run](https://github.com/utilityfueled/tax-engine/actions/runs/45017762942).

`7968206c` holds retained Form 2441 Part II facts, including Worksheet A,
until the taxpayer reconfirms them after a return-year change. All 496
scoped tests and all three affected audited browser scenarios passed.
[Form 2441 evidence](upgrade-2026-progress.md#november-22-form-2441-return-year-confirmation).

`891f921b` incorporates the guided federal payment, manual gambling,
direct Schedule A, alimony and household payroll source-year fixes.
Combined focused verification passed 430 tests, web type checking and
the seven affected spec lines. The exact archive passed coverage inventory
and contract type checking. `09b12787` refreshes the browser source
manifest. Core CI and Docker passed with 30,095 tests per core run and
88.57% branch coverage. Managed Linux passed 650 browser cases, with five
original skips. Strict AMD64 passed image smoke, recovery and archive
import. Its browser run passed 637 cases, retained five original skips,
and reported 11 Ohio deadlines and two railroad PDF inspection timeouts.
[Retained direct federal amounts](upgrade-2026-progress.md#november-22-retained-direct-federal-amounts).

`2a5c20c9` removes timer yields from Form 1095-C test-PDF construction.
The measured fixtures remained byte-identical and the deadline stayed
at five seconds. Exact Docker and GitHub CI passed. Remote unit and
coverage each passed 30,078 tests, with 88.56% branch coverage. Managed
Linux hit two railroad saved-PDF inspection timeouts. Strict AMD64 and
application-equivalent ARM64 passed image recovery and cleanup, with
seven and eleven Ohio browser deadlines respectively.
[Form 1095-C evidence](upgrade-2026-progress.md#november-22-form-1095-c-fixture-timing).

`913339ec` holds retained W-2s after a return-year change until their
original source year matches. The browser reproduced stale wages and
withholding on the prior revision. The corrected revision passed all
31 audited guided browser cases, both full local suites at 30,078 tests
and 88.56% branch coverage, and its public Docker build. Both local
PostgreSQL test instances shut down.
[W-2 evidence](upgrade-2026-progress.md#november-22-original-w-2-year).

`513629ff` and `9bc3fd3c` require fresh annual answers for dependents,
filers and spouses after a return-year change. The latest source
passed all 81 focused browser cases, all 9,868 spec references,
the coverage inventory and root and web types. Unit and coverage each
passed 30,075 tests across 2,192 suites with 88.56% branch coverage.
Remote CI matched both counts and coverage and all test PostgreSQL
16.16 instances shut down. Docker passed on the same source. Native
ARM64 passed smoke and Compose recovery. Full browser qualification
remains open. The two mortgage browser cases that had expected stale
residency to survive now re-enter it through the UI in `16c3d4dd`.
Managed Linux on that correction passed all 650 runnable cases.
Strict AMD64 passed 641 and strict ARM64 passed 640, with nine and ten
Ohio deadlines respectively. Both strict jobs passed image smoke,
Compose recovery and cleanup. Its separate unit job hit a Form 1095-C
deadline. Coverage passed all 30,075 tests.
[Annual personal facts evidence](upgrade-2026-progress.md#november-21-annual-dependent-filer-and-spouse-facts).

`b3cb03a7` preserves exact state refund payment matches and includes the
renewed donation recipient confirmation from `f68955f4`. Unit and coverage
each passed 30,071 tests across 2,190 suites at 88.56% branch coverage.
Remote CI matched those totals and the Docker build passed. All owned
test PostgreSQL 16.16 instances shut down. All 9,866 spec references,
the coverage inventory and root and web types passed. Both remote
Web jobs stopped before running cases because the audit still had
the prior hashes. `5a4b63d7` refreshes exactly three source hashes
and passed all 37 focused browser cases under the existing deadlines.
[Guided source evidence](upgrade-2026-progress.md#november-21-donation-and-refund-source-reconfirmation).

`41796dfb` passed local and remote unit and coverage with 30,064 tests
per run and 88.56% branch coverage. Managed Linux passed 650 browser
cases and strict AMD64 passed 642, with eight Ohio deadlines. Each
retained five existing skips. Strict AMD64 passed image smoke, Compose
recovery, archive import and cleanup. ARM64 on application-equivalent
`0e71304c` passed image smoke, Compose recovery and cleanup. Strict
ARM64 passed 641 browser cases with nine Ohio deadlines and five
existing skips.
[Exact evidence](upgrade-2026-progress.md#november-21-pending-ohio-header-preview-timing) ·
[ARM64 browser job](https://github.com/utilityfueled/tax-engine/actions/runs/44974785059).

[Open external actions](upgrade-2026-external-actions.md) tracks the remaining
tax and AI review, official forms, Stripe Sandbox, and runtime qualification.
The independent cybersecurity package remains deferred.

## November 21 resumption

`f1b2e0e6` requires renewed rental source confirmation when the return
year changes, including after save and reopen. `1cd93e1f` projects a
confirmed 2026 W-2 Code D deferral onto the final Form 8880 review
candidate. The reopened PDF showed a $200 credit and the matching
Schedule 3 transfer using the test-only statutory-rate preview.
`069c994f` now holds Schedule C after a return year change until both
annual reconciliations are renewed. Annual tax-table and export
qualification remain open. All 11 local commands passed on `069c994f`.
Both full suites passed 29,849 tests at 88.38% branch coverage. Managed
macOS passed 650 browser cases with five original skips. Exact CI and
Docker passed. The protected application Preview returned 200 for health
and sign-in, passed all 12 synthetic workspace lifecycle checks and passed
four billing-page checks for each synthetic account. Managed Linux passed 648
browser cases and retained five original skips. Both saved-PDF RRTA inspections
reached the four-second deadline. Strict AMD64 passed recovery and rollback,
with 639 browser passes, ten Ohio deadlines, one RRTA deadline and five
original skips.
[Rental verification](upgrade-2026-progress.md#november-21-guided-rental-review-after-a-year-change) ·
[Form 8880 verification](upgrade-2026-progress.md#november-21-final-form-8880-from-employer-deferrals) ·
[Schedule C verification](upgrade-2026-progress.md#november-21-guided-schedule-c-review-after-a-year-change).

`94620a66` removes a repeated Ohio reciprocal payment calculation while
preserving both synthetic returns byte for byte. `522cf4b1` corrects the
federal review cover for paid estimates. The reopened 2025 PDF showed
$1,234 on Form 1040 line 26, and the genuine Form 2210 finding still
made that packet partial. Both packages passed focused tests and a
separate review. All 11 local checks passed on `522cf4b1`. Unit and
coverage each passed 29,844 tests at 88.36% branch coverage. The browser
suite passed 650 cases with five original skips.
The protected test-billing Preview reached Ready, passed all 12
workspace lifecycle checks and passed four read-only billing checks for
each test account. The Viva La Tax Sandbox checkout destination points
to that exact Preview. On November 22, one synthetic checkout produced a
real test-mode Stripe Session and displayed the $19 Starter plan. Stripe
confirmed the Sandbox customer and configured return URLs. The browser's
Back link reached the configured cancel URL. The Session was unpaid and
scheduled for automatic expiry. Conditional postal behavior, success
return, expiry, signed completion delivery and exact ledger effects remain
open.
[Checkout rehearsal](upgrade-2026-progress.md#november-22-stripe-sandbox-checkout-and-source-recheck).
Exact-source CI and Docker passed. Managed Linux passed 650 browser
cases. Strict AMD64 passed Compose recovery and 642 browser cases. Eight
Ohio cases reached the original 30-second limit. Both runs retained five
original skips. The self-host release gate remains open.

Start with `activeContinuation.nov21GuidedFactInputCorrections`,
`activeContinuation.nov21CombinedReferenceAndBrowserReplay` and
`activeContinuation.nov21ExactCheckoutAndSpecValidation` in the
checkpoint. The newest guided fixes are `d02d3de1` for printed retirement
codes and `4425ad1d` for exact invoice receipts. On `4425ad1d`, the
PostgreSQL unit and coverage suites each passed 29,840 tests. Branch
coverage was 88.36%, and all eight static checks passed. Managed macOS
passed 650 active browser cases and retained five original skips, which
completes all 11 local checks. The exact local checkout package also
passed against PostgreSQL using synthetic Stripe delivery.
[Current evidence](upgrade-2026-progress.md#november-21-combined-suite-and-linux-timing-replay) ·
[Checkpoint](upgrade-2026-checkpoint.json).

All 11 required local commands passed on `2c576d2d`. The unit and
coverage suites each passed 29,837 tests. The managed browser suite
passed 650 active cases with five original skips. Docker build passed
on `aa75bb2d`. Native ARM64 passed image builds, smoke, recovery and
cleanup, with eight strict Ohio browser deadlines. At `156bd0b7`, managed
Linux passed 650 browser cases. The strict AMD64 container passed Compose
upgrade, recovery and rollback. Its original browser suite passed 638
cases, hit ten Ohio and two RRTA inspection deadlines and retained five
skips. Both diagnostic batches finished at the original limits. The
strict runtime qualification remains open.
Completion also depends on final annual forms, qualified human tax and
AI reviews, and provider qualification. The exact protected test-billing
Preview for `4425ad1d` reached Ready without a production alias and passed
all 12 workspace lifecycle checks. Current Stripe delivery and credit
evidence remains open. Hosted security work is deferred at the owner's
direction.
[External gates](upgrade-2026-external-actions.md).

Application `2d97913e` adds exact Form 8615 support for the early
withdrawal penalty as the only adjustment in the existing 2025 source
path. The combined tax and guided payment focused suite passed 615
tests and both type checks. The exact PostgreSQL-backed coverage suite
passed 29,717 tests at 88.29% branch coverage, and the temporary database
stopped normally. Vercel canceled the production deployment.
[Form 8615 source evidence](upgrade-2026-progress.md#2025-form-8615-early-withdrawal-penalty-reconciliation).

Application `01fcb98d` verifies the IRS application year for January and
out-of-year guided federal estimates. All 59 exact focused tests and
both existing desktop and mobile payment journeys passed.
[Payment evidence](upgrade-2026-progress.md#guided-federal-estimated-payment-application).

Applications `7d25dfa3`, `b864c369` and `f23bf92c` calculate the
supported 2025 Form 8615 preferential Worksheets 1, 2 and 3. The
threshold-itemizer fixture produced $2,030 for Worksheet 1. The other
federal fixtures produced $1,497 for Worksheet 2 and $1,453 and $1,905
for Worksheet 3. The isolated coverage run on `7d25dfa3` passed 29,712
tests at 88.29% branches.
[Worksheet 2 evidence](upgrade-2026-progress.md#2025-form-8615-preferential-worksheet-2) ·
[Worksheet 3 evidence](upgrade-2026-progress.md#2025-form-8615-preferential-worksheet-3) ·
[Worksheet 1 itemizer evidence](upgrade-2026-progress.md#2025-form-8615-worksheet-1-for-itemizers-at-the-threshold).

Application `b7cba0fd` verifies the $184,500 wage-base boundary and
records the transfer destinations printed on the final 2026 Form 8919.
The exact focused run passed 578 tests. At `be98b7cd`, both full suites
passed 29,705 tests at 88.29% branch coverage, all eight static checks
passed, and the protected Preview passed its 12 workspace checks. Managed
Linux and strict AMD64 hit their original RRTA inspection deadlines.
Strict AMD64 also recorded ten Ohio deadline failures. Its Compose
recovery, rollback, archive verification and cleanup passed. Final
Schedule 2 placement still requires the published annual form.
[Form 8919 evidence](upgrade-2026-progress.md#november-20-final-2026-form-8919-transfer-destinations).

Application `0c29105f` adds explicit 2025 Form 2441 living-apart answers
to the guided interview. The $660 synthetic credit, saved answers,
benefit-source validation and existing Part III route passed focused
checks. [Guided evidence](upgrade-2026-progress.md#november-20-guided-form-2441-living-apart-facts).
Both full suites passed 29,704 tests at 88.29% branch coverage, along with
all eight static checks and all 12 protected Preview workspace tests.

Application `651ab2d2` calculates the supported 2025 Form 2441 credit-only
exception for a qualifying married-separate filer. The synthetic case
produces a $600 Schedule 3 credit and the saved review PDF checks Line A.
All 223 focused tests and 133 combined-candidate tests passed.
[Form 2441 evidence](upgrade-2026-progress.md#november-20-form-2441-credit-only-separate-return).

Application `2ab355bd` restores prior Schedule B audit text for ordinary
returns. The follow-up passed 185 tests, including the Ohio predecessor
fingerprints. `27f6214d` restores browser admission for the reviewed source.
[Browser and Schedule B evidence](upgrade-2026-progress.md#november-20-browser-preflight-and-schedule-b-audit-compatibility).

Application `f03e966b` calculates the supported 2025 Form 8615 Worksheet 1
for a nonitemizing child with ordinary qualified dividends or capital gains.
Federal amounts must reconcile before a reported stop is accepted. All 614
focused tests and the independent engineering review passed.
[Worksheet 1 evidence](upgrade-2026-progress.md#november-20-form-8615-preferential-worksheet-1).

Application `1fa4f266` carries Form 8814 dividends to Schedule B and fixes
the physical 2025 review PDF total. A saved PDF passed the last-row check.
The engine retains overflow rows and the review export reports the limit
before writing a packet. All 222 focused tests passed.
[Form 8814 evidence](upgrade-2026-progress.md#november-20-form-8814-and-schedule-b).

Application `3a0a8042` aligns Form 8615 audit and reference PDF rows with
the printed form, including sibling allocations and the zero floor for
parental taxable income. All 538 focused tests passed.
[Audit evidence](upgrade-2026-progress.md#november-20-form-8615-printed-audit-rows).

Application `9d2cfeb2` corrects Form 8615 for itemizing children, checks
the amount against the actual Schedule A deduction and preserves the
printed stop rules. The combined federal, form, edge and PDF run passed
547 tests on Node 26.13.1. The full suites passed 29,675 tests each at
88.27% branch coverage. Preferential itemization and Schedule AI remain open.
[Form 8615 evidence](upgrade-2026-progress.md#november-20-form-8615-itemized-deduction-threshold).

Application `cdfdd050` shows literal Form 1098-E and Form 1099-R
Copy B evidence in the selected 2026 guided interview. All 22 actual
Chromium cases passed, including year rejection, historical filenames,
explicit zero, unconfirmed dates, and reopening the stored original.
Both exact local suites passed 29,665 tests at 88.26% branch coverage.
All eight static checks and the exact CI and Docker workflows passed.
The complete managed macOS suite passed all 650 active cases with five
original skips.
The protected test-mode Preview passed all 12 workspace lifecycle checks
on this revision.
The 2026 calculation, export and filing gates remain closed.
[Source and verification](upgrade-2026-progress.md#november-20-original-student-loan-and-retirement-statements).

Application `1a9bfd0d` distinguishes the IRS's 2026 informational W-2
packet from a standalone Copy B. The packet stays under the existing
future-year guard and supplies no financial facts. All four original browser
regression cases and five standalone Copy B controls passed on the corrected
production web build. Both exact local suites passed 29,650 tests at 88.24%
branch coverage. All eight static checks, six exact GitHub CI jobs and the
exact Docker workflow passed.
The complete managed macOS run passed all 650 active browser cases with
five original skips.
[Packet correction](upgrade-2026-progress.md#november-20-official-w-2-informational-packet-correction).

Application `8ba14f4b` imports separately evidenced wages and federal
withholding from one populated 2026 IRS W-2 Copy B statement. Five actual
Chromium upload-and-reopen cases passed. Blank and ambiguous originals
remain manual, and the 2026 calculation and filing gates remain closed.
[W-2 evidence](upgrade-2026-progress.md#november-20-official-2026-w-2-copy-b-guided-intake).

Application `b948a284` saves a matching 2026 W-2 or NEC original in the
user-selected 2026 guided interview. Actual Chromium verified both filled
and blank IRS Copy B uploads across reopen, including an empty saved 2025
interview switched to 2026. The 2026 calculation and export gates remain
closed. Both exact local suites passed 29,634 tests at 88.24% branch coverage.
All eight static checks, six GitHub CI jobs and the Docker workflow passed.
The protected test-mode Preview passed 12 workspace lifecycle checks and
four read-only billing preflight checks. Managed macOS passed 650 browser
cases with five original skips. Managed Linux and both strict architecture
browser runs still have deadline failures.
[Matching-year source evidence](upgrade-2026-progress.md#november-20-matching-year-guided-originals).

Application `ef0ebdc2` accepts source-supported year and Box 1a text from the
official fillable or flattened December 2026 Form 1099-NEC Copy B. It retains
manual confirmation of the source and independent business facts. `7bf20915`
also preserves Ohio reciprocal-wage confirmation when focus leaves an
unchanged monetary field. The targeted Chromium run passed 34 cases. The
successor passed 1,038 focused tests including the corrected literal spec
test reference. Both exact local suites passed 29,623 tests at 88.46% branch
coverage, and all eight static checks passed. The matching 2026 guided
interview still rejected the recognized 2026 original under the global 2025
upload guard. The matching-year successor above corrects that behavior.
[Source and checks](upgrade-2026-progress.md#november-20-nec-copy-b-calendar-year-and-ohio-confirmation).

Application `8486eca8` reads a separated Box 1a amount on the December
2026 Form 1099-NEC Copy B when the printed layout and the field position
agree. The rendered IRS page with a synthetic amount returned exactly
$3,210.09. Blank, contradictory and rotated controls preserved manual
review. The adjacent-column control yielded only the Box 1a suggestion.
Both the populated and blank official pages passed upload and reopen in
the local production browser build.
Ninety-seven focused tests, all eight static checks and 9,717 spec references
passed. Both complete local suites passed 29,589 tests at 88.45% branch
coverage. The audit hash refresh `3663cf3e` and diagnostic digest refresh
`f1e6f6a8` restored all 35 timing-contract checks. The exact
`f1e6f6a8` protected test-mode Preview passed all 12 synthetic lifecycle
checks. The complete managed macOS and Linux browser runs each passed
650 cases with five original skips. All six exact GitHub CI checks
passed. Strict AMD64 passed Compose recovery and ran 637 successful
browser cases, with eleven Ohio deadlines, two RRTA saved-PDF inspection
timeouts and five original skips. Strict ARM64 passed image smoke,
Compose recovery and cleanup, with 640 browser passes, ten Ohio
deadlines and five original skips. Both strict browser gates remain
open.
[Copy B evidence](upgrade-2026-progress.md#november-20-printed-1099-nec-copy-b).

Application `8201d316` passed 29,588 tests in both exact local suites at
88.45% branch coverage. All six exact GitHub CI jobs, both builds, all
three type checks, lint, spec references, the inventory, 37 education
browser cases, and 12 protected
test-mode Preview lifecycle checks passed. The exact macOS managed suite
passed 650 cases with five original skips. Managed Linux passed 648 with
two RRTA saved-PDF inspection timeouts and five original skips. Strict
AMD64 passed image smoke and Compose recovery and recorded 648 browser
passes, two Ohio school deadlines and five original skips. Strict ARM64
passed image smoke, Compose recovery and cleanup, with 642 browser
passes, eight Ohio deadlines and five original skips.
[Form 8863 evidence](upgrade-2026-progress.md#november-20-form-8863-adult-student-tin-reconciliation) ·
[Exact CI](https://github.com/utilityfueled/tax-engine/actions/runs/44765989343).

The IRS archived blank Form 1095-A now contributes only the manual review
prompt under its historical 2025 filename alias. A browser run on the earlier
revision reproduced synthetic premiums on that blank. Saved workspace facts
are rebuilt from their original documents. Reopening a return clears the fake
amounts from the live view. The next normal save clears them from the stored
record. The review prompt and any saved response are retained.
[Marketplace evidence](upgrade-2026-progress.md#november-20-marketplace-filename-and-saved-workspaces).

Registry filenames now provide document labels and review prompts. The
workspace gets financial values from supported detected sources and manual
input. Independent replay cleared stale synthetic values from eight legacy
aliases. The combined upload corrections passed 63 guided, workspace and
recovery browser cases on Node 26.13.1.
[Information return evidence](upgrade-2026-progress.md#november-20-dividend-government-oid-and-hsa-filename-facts).

An exact unit run on the information-return revision exposed seven failures
in the Ohio School browser test harness. The repair in `96a9179f` passed
29,579 tests in both the exact unit and coverage runs on Node 26.13.1.
Branch coverage was 88.45%, and all eight static checks passed. The
earlier application passed 650 managed macOS browser cases with five
original skips. The protected test-mode Preview passed all 12
cross-revision lifecycle checks. The original unit failures remain in the
evidence.
[Ohio School harness](upgrade-2026-progress.md#november-20-ohio-school-snapshot-harness) ·
[Annual availability recheck](upgrade-2026-official-source-refresh-20261117-continuation.md#november-20-annual-availability-recheck).

The exact `c3d87e32` managed macOS browser run passed 650 cases with five
original skips. Its unit and coverage runs each passed 29,559 tests at
88.37% branch coverage. A separate test-only Ohio School District change
passed four local cases at the existing 30-second deadline. Strict Linux
qualification remains open. A separate Ohio app change passed 14 local
browser cases covering reciprocal wages, business, resident credit, and
School District returns at the same deadline.
[Ohio school evidence](upgrade-2026-progress.md#november-20-ohio-school-mutation-controls).
[Ohio app evidence](upgrade-2026-progress.md#november-20-ohio-draft-comparison).

The latest application revision with a verified protected Preview is
`012e6ee1` on `main`. Exact unit and coverage runs each passed 29,556
tests at 88.37% branch coverage. All six exact GitHub CI jobs, both builds,
all three type checks, lint, 9,693 spec references, the inventory, Docker and eight
scoped browser cases passed. The protected test-mode Preview passed
all 12 workspace lifecycle checks. The complete managed browser suites
passed 650 cases each on macOS and Linux. The strict Linux browser runs
reached ten Ohio deadlines on AMD64 and nine on ARM64.
[Exact application and Preview evidence](upgrade-2026-progress.md#november-20-exact-012e6ee1-local-verification).

On previous application `29988f04`, local unit and coverage runs each
passed 29,549 tests at 88.37% branch coverage. The first exact CI
attempt passed five jobs. The unit job had one Pennsylvania PDF test reach
its five-second deadline. The unchanged unit-job retry passed, bringing
the exact run to six successful jobs. Test-only commit `3a1f8156`
retained that deadline and passed all 94 scoped PDF tests.
[CI](https://github.com/utilityfueled/tax-engine/actions/runs/44725543701) ·
[Web and AMD64](https://github.com/utilityfueled/tax-engine/actions/runs/44725543747) ·
[ARM64](https://github.com/utilityfueled/tax-engine/actions/runs/44725578957).

The full managed browser job passed 648 cases, skipped five, and hit the
four-second saved-PDF inspector deadline on both RRTA cases. Strict AMD64
passed 640 cases with ten Ohio deadlines. Strict ARM64 passed 641 cases
with eight Ohio deadlines and one Pennsylvania desktop deadline. Both
strict jobs retained five skips and passed their Compose recovery and
cleanup steps.
[Exact runtime evidence](upgrade-2026-progress.md#november-20-exact-29988f04-browser-results).

Prior `074a4fa9` passed all six CI jobs, 650 managed browser cases, and six
local recovery cases. Both strict Linux images passed their recovery steps.
Eight AMD64 and eleven ARM64 browser cases reached the existing deadlines.
[Prior exact browser and recovery evidence](upgrade-2026-progress.md#november-20-incomplete-ohio-guided-validation).

On prior application `d8a9f108`, Form 8863 holds
conflicting 2026 employment-valid SSN answers from the return household,
claimant or matched adult student. Its focused education and browser checks,
both builds, types, lint, inventory and 9,674 spec references passed. Exact
local unit and coverage each passed 29,525 tests with 88.36% branch coverage.
All six exact CI jobs, Docker and 650 managed browser cases passed. Strict
AMD64 passed Compose recovery and archive import with ten Ohio browser
deadlines. Both browser jobs preserved the five original skips.
[Reconciliation evidence](upgrade-2026-progress.md#november-20-form-8863-claimant-and-student-ssn-reconciliation) ·
[Exact CI](https://github.com/utilityfueled/tax-engine/actions/runs/44711171955) ·
[Exact browser jobs](https://github.com/utilityfueled/tax-engine/actions/runs/44711171830).

On prior application `cf43e9ea`, all six exact GitHub CI jobs passed. Two saved RRTA PDF inspections timed out
in the full managed browser suite. Both passed an exact scoped macOS replay.
Strict AMD64 passed smoke, Compose recovery, archive import and cleanup, with
eight original Ohio browser deadlines.
The focused Ohio comparison passed all ten cases in each runtime on the same
AMD64 runner.
[CI](https://github.com/utilityfueled/tax-engine/actions/runs/44700308280) ·
[Web](https://github.com/utilityfueled/tax-engine/actions/runs/44700308191) ·
[Ohio comparison](https://github.com/utilityfueled/tax-engine/actions/runs/44699380902).

| Package | Current evidence and remaining criterion |
| --- | --- |
| Taxpayer facts and federal law | The guided interview retains short-period dates and ties them to the taxpayer and return year. The public calculator holds annualized amounts. Qualified independent tax interpretations and expected outputs remain open. [Intake evidence](upgrade-2026-progress.md#november-23-actual-short-accounting-period-intake) · [Tax review cases](upgrade-2026-external-actions.md). |
| State and form exports | PA and Ohio are selected for full-year residents, part-year residents and nonresidents. Final Schedule EIC and Forms 2106, 7206, 8829 and 8919 are pinned as disabled candidates. The latest Form 1040, general annual instructions and Tax/EIC tables still print 2025. Schedule B instructions now print 2026, while its blank prints 2025. Qualification of the maps, scenarios and federal/state transfers remains open. [Official sources](upgrade-2026-official-source-refresh-20261117-continuation.md). |
| AI routing and exact billing | Exact cost is recorded separately from whole retail credits. The hold for a second attempt checks the cumulative bound under the owner lock. Independent labels, held-out assessment, repeated live qualification and selected Google project access remain open. [Billing evidence](upgrade-2026-progress.md#november-23-exact-ai-escalation-hold) · [Provider evidence](upgrade-2026-provider-catalog-20261117.md). |
| Hosted recovery | Protected Preview `cdfdd050` passed all 12 workspace lifecycle checks. Four read-only billing checks passed for each of two authorized actors on `1a9bfd0d`. Its configured prices match Stripe Sandbox, and the canceled actor displays enabled checkout choices. The webhook points to an older Preview. Earlier evidence covers email delivery, Stripe scheduled retry, and isolated 11-table migration, rollback and restore. Current checkout, signed delivery and exact credit reconciliation remain open. [Preview](upgrade-2026-progress.md#november-20-original-student-loan-and-retirement-statements) · [Billing baseline](upgrade-2026-progress.md#november-20-stripe-sandbox-catalog-and-billing-baseline) · [Migration](upgrade-2026-progress.md#november-19-persistent-preview-migration-and-restore). |
| Self-host recovery | Exact `35d69e98` passed 650 local Chromium cases, 648 managed Linux cases and 635 strict AMD64 cases. The latest tested ARM64 source, `cee016b0`, passed 641 strict cases. All retained five original skips. Native recovery, independent archives, scanning and cleanup passed. Managed and native Linux browser qualification remains open. [Managed Linux](https://github.com/utilityfueled/tax-engine/actions/runs/45337535163/job/138253064371) · [Strict AMD64](https://github.com/utilityfueled/tax-engine/actions/runs/45337535163/job/138253064692) · [Strict ARM64](https://github.com/utilityfueled/tax-engine/actions/runs/45328290048/job/138237070258). |
| Security and release | Cybersecurity work is deferred at the owner's direction. Independent security/privacy review and advisory disposition remain release criteria. Production automatic builds stay disabled. Filing and model promotion remain closed. [External actions](upgrade-2026-external-actions.md). |

The `resume` entry in the [checkpoint](upgrade-2026-checkpoint.json)
points to current exact runs and evidence paths.
Earlier verification remains in the [progress log](upgrade-2026-progress.md).
The [execution brief](upgrade-2026-execution-brief.md) defines completion.
