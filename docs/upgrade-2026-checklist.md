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
- [ ] Recheck peers/lockfile and Sentry 11 migration separately.
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
