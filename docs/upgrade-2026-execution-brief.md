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
