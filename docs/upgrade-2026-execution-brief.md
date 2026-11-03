# Complete the 2026 upgrade

This is the remaining scope of the user's implementation handoff for tax year
2026, filed in 2027, supporting public hosting and self-hosting. It accompanies
[the implementation history](upgrade-2026-progress.md) and
[the local checkpoint evidence](upgrade-2026-checkpoint.json). Those files record
completed work and known gaps; refresh their evidence before relying on it.
The original handoff in the conversation remains authoritative if available.

## Execution and boundaries

- Inspect the current branch, remote and worktree before editing. Preserve
  unrelated changes, including any untracked review documents. Continue the
  existing upgrade branch unless a separate branch is needed for isolated work.
- Follow `AGENTS.md`: official research, spec YAML, a failing spec-linked test,
  Decimal implementation, then `pnpm test`. Use Decimal in money adapters,
  aggregation, billing and form calculations, with each line's required rounding.
- Keep tax law, dependencies, AI, hosting and documentation in separate,
  reviewable commits. Commit each coherent package after its relevant checks
  pass. Push those commits regularly when authorized. Record existing failing
  global gates honestly; they do not justify omitting new package verification.
- Maintain a durable checklist, sources and check results in the repository.
  Resume after context compaction. A progress report or checkpoint is not task
  completion. Work on every independent package while external blockers remain.
- Do not add formal verification, proof pilots, Z3, Lean, Dafny or Catala.
- Preserve historical calculations and carryovers. Unknown or incomplete years
  must fail explicitly. AI cannot change year/readiness gates, invent facts,
  calculate authoritative tax or override engine values.
- Do not enable filing, publish readiness claims, promote a model or declare
  completion based only on a green build, generated tests or existing PDF support.
  No e-filing integration is included unless separately requested.
- Do not force-push, merge to the default branch, deploy to production, charge
  real customers, transmit real taxpayer documents or alter unrelated services
  without the applicable authorization. Synthetic development and test work can
  proceed. Ask only for missing decisions, credentials or genuinely required
  approval; continue other work while awaiting answers.

## Remaining implementation

1. **Baseline and security.** Raise branch coverage from the recorded 81.52% to
   at least 85% with meaningful boundary, failure and integration tests. Do not
   lower thresholds or remove coverage to pass. Run remote CI, refresh package
   and image advisories, and resolve findings or document exposure evidence,
   owner and expiry. Retain the lockfile and validate peer requirements. Keep
   TypeScript 5.9.3, Decimal.js 10.6.0 and pdf-lib 1.17.1 unless a demonstrated
   need requires changing them. Next uses webpack explicitly; preserve and test
   its aliases. Review Sentry 11 separately rather than silently migrating it.

2. **Complete facts and years.** Remove remaining inferred mortgage
   principal/lender, donation type/date/recipient, estimated-payment date,
   retirement code/taxable amount and education history. Collect the actual
   required facts, preserve missing values as unknown and preserve zero. Audit
   all adapters and UI aggregation for floating-point money. Complete spouse,
   dependent, residency, eligibility and cross-document validation. Carry year
   through contracts, saved workspaces, calculations, carryovers and form maps;
   migrate legacy workspaces without guessing or changing their year.

3. **Federal law.** Finish an independent immutable 2026 rule pack with rule
   version, authoritative source section/revision, retrieval date and review
   status. Verify all indexed values and payroll parameters. Finish SALT MAGI
   phase-down, CTC eligibility/refundability, Schedule 1-A tips/overtime/vehicle
   interest/senior deductions, charitable deductions and floors, high-income
   itemized limits, gambling losses, dependent care/adoption, education/529,
   QBI, PTC/APTC, and energy/vehicle transition dates and carryforwards. Make
   taxable refunds and historical carryovers year-aware. Recheck the 2025
   corrections and remaining eligibility branches. Use independently derived
   expected outputs and IRS examples, not the implementation as its own oracle.
   Test both sides of thresholds, cents/rounding, ages, filing statuses,
   zero/negative inputs, aggregation and federal/state interactions.

4. **States and PDFs.** Select one or two existing dedicated states using user
   demand and a documented gap analysis; do not infer qualification from old
   verified labels. Research official conformity/decoupling, residency, local
   tax, credits and carryovers. Publish support by year, state, residency,
   scenario/form and output capability. Version blank forms/maps physically by
   year and qualify each final revision. Implement a complete-data filing export
   separately from redacted review downloads, with readiness gates on every
   guided/preview/export path. Unqualified or draft mappings remain unavailable.

5. **AI routing and billing.** Finish migrating the legacy workspace responder
   to the task adapter. Remove its hardcoded preview defaults, `minimal` effort
   and implicit provider switching. Candidate routes are Luna High for summaries,
   interview wording, unsupported-route messages, document classification,
   income extraction and expense categorization; Sol Low for tax explanations
   grounded in year-specific IRS/spec excerpts and verified audit entries; one
   explicit Sol High escalation for unresolved evidence/validation; explicitly
   selected Gemini 3.8 Flash High as an optional alternate. Verify actual provider
   availability and current official capabilities/prices before use. Model
   recommendations are candidates, not qualification evidence.

   Preserve deterministic parsing first, redacted extracted text only, opt-out,
   URL protections, `store: false`, structured outputs, Zod validation and
   versioned prompts/schemas. Treat document instructions as untrusted. Do not
   add raw PDF/image/vision uploads. Require user confirmation for extracted
   facts and ambiguous business use. Enforce per-task input/output budgets,
   including reasoning, and bounded timeouts; complex work needs cancellation.
   Cache only within user/privacy scope, keyed by content/year/rule/model/prompt.
   Self-hosting must work without AI.

   Implement exact, atomic credit reservations and settlement, including actual
   usage, cache/context/regional charges, failed attempts, retries and refunds.
   Preserve exact provider cost separately from the minimum one-cent retail
   charge. Reject unknown pricing. The supplied short-context baseline was Luna
   $0.10/$0.50 and Sol $2/$10 per million input/output tokens; Gemini $0.75/$3.75
   through 2026-12-31 and $1.50/$7.50 from 2027-01-01. Refresh official prices and
   retain effective dates; use filing-season cost in promotion decisions.

6. **AI qualification.** Turn the 240 draft template variants into 200–300
   representative, independently reviewed synthetic cases. Include monetary/date
   fields, statement transactions, duplicates/refunds/transfers, ambiguous
   expenses, missing/conflicting facts, unsupported cases, prompt injection and
   PII. Do not count generated variants as independent human review. Preserve a
   held-out subset and repeat runs. Compare selected profiles against GPT-5 Mini
   and Gemini 3 Flash Preview where available; record unavailable or failed
   candidates honestly. An LLM alone must not judge monetary correctness.

   Require at least 99.5% schema validity and 99.5% required monetary/date exact
   match on answerable extraction cases, with abstention measured separately;
   no critical-field regression; zero observed PII leaks, invented filing-ready
   claims or engine-value overrides; and meaningful quality/cost benefit within
   predeclared P50/P95 latency and spend budgets. Include escalation/failure cost
   and January pricing. Zero observed failures is not proof. Implement reversible
   5% → 25% → 100% rollout and rollback to a previously qualified route or
   deterministic fallback. Do not promote until evidence passes.

7. **Hosting and recovery.** Rehearse hosted auth/recovery, tenant isolation,
   persistence/deletion, telemetry redaction, upload limits, shared spending and
   abuse limits, and Redis/provider/DB outages. Exercise Stripe duplicate and
   retried webhooks, atomic credit reconciliation, migrations, rollback and
   backup restoration in staging. Implement and prove a full-fidelity local
   export/import/recovery path: server backups cannot recover browser-only facts
   or documents, and review bundles are not complete backups.

   Retest Docker/Compose configuration, health, assets/templates, persistence,
   upgrades and rollback on the target platforms. Produce an SBOM from each final
   runtime image, scan it and publish versioned artifacts only after the relevant
   qualification and authorization. Test keyboard/mobile and both distributions
   through upload → confirm → calculate → export → reopen → delete. Complete the
   independent security/privacy review appropriate to the service.

## Sources to refresh

- [IRS Rev. Proc. 2025-32](https://www.irs.gov/irb/2025-45_IRB)
- [Schedule A](https://www.irs.gov/instructions/i1040sca)
- [Schedule 8812](https://www.irs.gov/instructions/i1040s8)
- [Schedule 1-A](https://www.irs.gov/newsroom/irs-published-schedule-taxpayers-will-use-to-claim-deductions-on-no-tax-on-tips-no-tax-on-overtime-no-tax-on-car-loans-no-tax-on-seniors)
- [Publication 505](https://www.irs.gov/publications/p505)
- [2026 AFTR worklist](https://www.irs.gov/pub/irs-pdf/p6079.pdf)
- [SSA wage bases](https://www.ssa.gov/OACT/COLA/cbb.html)
- [IRS security reference](https://www.irs.gov/pub/irs-pdf/p4557.pdf)
- Official state revenue-department instructions and final forms for chosen states
- [OpenAI models](https://developers.openai.com/api/docs/models) and
  [pricing](https://developers.openai.com/api/docs/pricing)
- [Google pricing](https://ai.google.dev/gemini-api/docs/pricing)

## Completion evidence

Run and record `pnpm test`, `pnpm test:coverage`, `pnpm typecheck`,
`pnpm typecheck:contracts`, `pnpm typecheck:web`, `pnpm spec:validate`,
`pnpm spec:inventory:check`, `pnpm build`, `pnpm build:web`, `pnpm lint` and
`pnpm test:web`, with documented Python/pypdf, sample-document and browser
prerequisites. All required checks and the 85% branch gate must pass. A skipped
hosted test does not establish hosted readiness.

Completion also requires reviewed specs and independent expected outputs,
complete facts and qualified final forms for every enabled scenario; resolved
or owned/expiring advisories; passed staging security/billing/recovery checks;
qualified AI routes with exact accounting, opt-out and rollback; and agreement
between actual hosted/self-hosted artifacts, support claims and documentation.
Distinguish local synthetic, remote CI, staging and production evidence. Never
substitute agent review for required independent human review or invent results.

If an external dependency prevents completion, identify the exact missing input,
the work already attempted and the specific completion criteria affected. Ask
for that input and keep working on all unblocked packages. Stop as blocked only
when no authorized, useful implementation or verification work remains possible.

Execution evidence2026-11-03: finite2025 original-bound PA married official review
renderer passes independent19/current-main277 plus all12 checks; actual12PDF/24
pages pass strict privacy and reviewed pixel/visual checks. See
[the renderer ledger](upgrade-2026-pa-married-official-review-work.md). This does
not complete public routing, broader cohorts, final2026 forms, human review or
hosted/self-hosted qualification. All completion criteria above remain required.

Execution evidence2026-11-03: the bounded Ohio resident-credit linked-payment
source successor passes distinct31/current-main1961 plus all12 checks. See
[the transaction ledger](upgrade-2026-ohio-resident-credit-transactions-work.md).
External account authenticity, native/physical/human/final2026 and deployment
qualification remain separate required evidence.


### November 3: validated Preview recovery email origin

Actual staging email exposed a stale configured origin. The bounded hosting fix
selects the existing validated Preview origin before the unchanged strict mail
parser and denies invalid platform metadata before SMTP. Fresh main39fail/19pass
precedes adoption; distinct11+author42/old5+adjacent202 all pass (260/15), with
all12 checks and zero lint warnings. See [the hosting ledger](upgrade-2026-hosted-preview-recovery-origin-work.md).
Corrected actual Preview delivery and all broader qualification gates remain open.

### November 3: actual Ohio business desktop/mobile sources

Current-main nonresident/part-year journeys pass4/4 with zero retries, preserving actual property/payroll/receipt/deduction originals and unknown-zero distinctions through edits and reopening. The narrow Zod validation message repair keeps source and tax guards unchanged. All13 static sets and98 affected controls pass; distinct saved4PDF/132page privacy, text/pixel parity and40geometry review passes. See [the browser ledger](upgrade-2026-oh-business-native-browser-work.md). Official business physical forms, broader cohorts, human/final2026 and distribution/staging qualification remain open. Preview recovery-origin fixb42afbf5 is pushed.

### November 3: separately owned Pennsylvania public review downloads

Original-bound2025 J/M households now reach the public and workspace Review PDF paths with one actual federal household and separately owned PA40/SP pages. Genuine13RED/23PASS precedes exact reviewed adoption;260affected controls and all12checks pass. Bounded summary pagination preserves every warning, source line and font while keeping text on the page. Distinct54PDF/192page strict/privacy/text/pixel review passes. See [the public-download ledger](upgrade-2026-pa-married-workspace-review-work.md). Actual browser successor, broader cohorts, qualified human/final2026 and distribution/staging gates remain open. Ohio business browser970326c8 is pushed.

### November 3: Stripe key and signed-event mode binding

Hosted billing now denies configured opposite-mode/unsupported keys before outbound effects and rejects signed events with missing, malformed or opposite livemode before writes. Distinct16 and author33 source-first controls reproduce36mainRED;158focused+188adjacent and all13checks pass after the narrow two-product fix. Ten PostgreSQL cases remain skipped and11old fixture lint warnings retained; actual Stripe qualification continues. See [the billing ledger](upgrade-2026-hosted-billing-mode-binding-work.md). Exact b42 Preview recovery delivery/reset/session/token checks also pass; the corrected [external-action handoff](upgrade-2026-external-actions.md) separates that bounded evidence from remaining staging and human/provider/final-form gates. PApubliccffef1ac is pushed.

### November 3: actual reciprocal employee desktop/mobile lifecycle

Current-main refund/knownzero journeys pass4/4 without retries through native originals, equal-cash source invalidation, unknown withholding reload, explicit reconfirmation, review download and reopen. Each actual review200 binds saved response bytes; separate filing400 stays denied. All7 scoped static sets pass; distinct saved4PDF/88page privacy/text/RGB and40geometry review passes. See [the browser ledger](upgrade-2026-oh-reciprocal-native-browser-work.md). No product change; official reciprocal physical forms, broader cohorts/currentglobal/distributions/staging/human/final2026 remain open. Security0e4c2df6 and hostedmode80bc752f are pushed.

### November 3: actual married Pennsylvania review downloads

Current-main J/M desktop/mobile journeys now verify actual200 and one saved review download, one federal household and separately owned PA40 pages through edit/reconfirm/reopen. All4browser cases and8static sets pass without retries. Distinct4logicalPDF/60unique page strict/privacy/physical/text/RGB and36geometry review passes. The new-reader printedline16 error is retained and corrected from official extension-payment authority without changing tax or source oracles. See [the browser ledger](upgrade-2026-pa-married-native-review-browser-work.md). Broader cohorts, fullglobal/dependency/distribution/staging/AI/human/final2026 gates remain open; reciprocalbrowserb45cda6c is pushed.

### November 3: separately verified Next 16.4.5 update

Next and its ESLint plugin now use16.4.5 with exact eleven-family integrity changes. Frozen install,480security/Compose controls, types3, lint and both builds pass; actual managed production browser28/28 passes without retries/skips. Independent static review approves the bounded dependency diff. Seven primary-advisory metadata conflicts/exposure limits remain assigned to this goal for recheck by November4 19:30UTC or before qualification, without risk acceptance. See [the security ledger](upgrade-2026-next-1645-security-work.md). Current images/global/staging/human qualification remain open; PA married browser82e97db7 and reciprocalbrowserb45cda6c are pushed.

### November 3: separate PA cash in Ohio reciprocal sources

The finite original-bound reciprocal method now retains actual nonnegative PA withholding independently of Ohio cash. Main12genuineRED/33PASS precede the one-guard change;45focused+219adjacent and all12checks pass. Distinct review verifies official authority and independent cash oracles; PA1842.01/.02 never enters Ohio withholding/refund2001/0. The cent-precision cohort boundary stays explicit. See [the source ledger](upgrade-2026-oh-reciprocal-pa-withholding-work.md). Physical reciprocal output/global/distribution/staging/human/final2026 remain open. Next security7a4be2bb is pushed separately.

### November 3: native Ohio resident-credit original records

The finite2025 single Ohio resident/Virginia ordinary-W2 collector now preserves actual filed return, completed account and distinct settled-bank/applied-agency payment originals through explicit confirmation and JSON replay. Current-main4genuine admission/UI failures precede six reviewed products;57focused+379adjacent and all13checks pass. Distinct review and root7 independent controls preserve unsupported-source/paired-payment guards. See [the native ledger](upgrade-2026-oh-resident-credit-native-work.md). Actual browser, resident district/county facts, physical forms, broader cohorts/global/staging/human/final2026 remain open. SeparatePAWH afb29967 and security7a4be2bb are pushed.

### November 3: full PostgreSQL-backed unit run and ticker disclosure successor

Exact84a4 full unit execution yields24,259PASS/2FAIL/0SKIP across1,813files; the two failures share an obsolete PA married ticker disclosure expectation. Spec-first correction now requires the entire current source-validated PA40/SP review disclosure and explicit filing/local denial, preserving all money/layout guards. Independent review and affected4+adjacent115/spec7817/AST739/strict0 pass. See [the disclosure ledger](upgrade-2026-pa-married-ticker-disclosure-work.md). Full successor/global coverage and distribution/staging/human/final2026 gates remain open; nativeRC84a4cc87 is pushed.

### November 3: actual resident Ohio header originals

The finite2025 single full-year resident now supplies actual residential, Finder, county and official district-list originals through typed native fields and explicit confirmation. Parent/payment/RC replay and opaque review bind the complete source packet; unknown and stale records remain denied. Source-first admission/lifecycle controls reproduce12 genuine failures plus one message-specificity failure before the bounded changes. Final557 affected controls, types3, builds2, spec/inventory and strict lint pass. Saved5PDF/11page strict/privacy review and all11body-pixel parity pass; every reference page now carries exactly one existing review notice. See [the source ledger](upgrade-2026-oh-return-header-sources-work.md). Native header browser, official resident companions, broader cohorts, qualified human/final2026 and global/distribution/staging/provider gates remain open. The prior disclosure fix48ad9f69 is pushed.

### November 3: actual resident-credit desktop/mobile lifecycle

Current-main native Virginia return/account and two linked remittance originals pass4desktop/mobile journeys without retries, through same-cash identity edits, unknown/zero, save/reopen and two actual review downloads each. All10 scoped static/inventory sets pass; independent8PDF/184page strict/privacy review passes with184old-to-current text/RGB matches,92initial/reopen pairs and16geometry records. See [the browser ledger](upgrade-2026-oh-resident-credit-native-browser-work.md). Outputs remain financial references; official resident companions, complete header browser, broader cohorts and global/distribution/staging/provider/human/final2026 gates remain open. Headerbbfabb65 is pushed.

### November 3: independent PA residency export test cases

The actual three-residency PDF loop now runs as three independent cases with the unchanged normal5s deadline. All original assertions and four negative bodies remain intact;21 affected controls plus spec/types/strict/inventory pass and distinct review approves. See [the test ledger](upgrade-2026-pa-workspace-export-test-isolation-work.md). Historical48ad coverage passed87.30% branches, while its plain unit/browser failures remain recorded; successor remote/global/distribution/staging/human/final2026 qualification is pending. Resident-credit browsere0f5ffc1 is pushed.

### November 3: upload-panel status follows actual documents

One display paragraph now shows the actual local upload acknowledgement or persisted document status in Upload Documents. The full unchanged17browser cases and8static sets pass; the first16/1 duplicate-answer failure is preserved and resolved without test or budget changes. Distinct review approves. See [the UI ledger](upgrade-2026-workspace-upload-panel-status-work.md). Hosted/container/fullglobal/staging/human/final2026 qualification remains open. PA test isolation72143bc9 is pushed separately.
