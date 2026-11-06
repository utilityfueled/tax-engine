# Actual PA digital capital sources

This package adds a finite, original-bound PA calculation and its guided source
panel. It does not qualify filing, final2026 forms, or a new official ScheduleD
download. The execution brief remains the full remaining scope.

## Sources and behavior

Official [2025 ScheduleD and instructions](https://www.pa.gov/content/dam/copapwp-pagov/en/revenue/documents/formsandpublications/formsforindividuals/pit/documents/2025/2025_pa-40d.pdf)
and [ScheduleSP](https://www.pa.gov/content/dam/copapwp-pagov/en/revenue/documents/formsandpublications/formsforindividuals/pit/documents/2025/2025_pa-40sp.pdf)
were refreshed November3UTC. Independent PA basis, taxpayer allocation,
class-specific loss treatment, disclosure and worldwide eligibility-income
requirements remain explicit in the specs. The final2025 D asset has SHA256
`154a86698c3c7e81d2487ce518c767a8253781a7aa2b8fcd9974d8bb5ce4b30e`.

Only full-year resident, primary-owned capital purchases sold for cash are
supported here. Each actual statement and transaction occurs exactly once;
PA basis remains independent of federal basis. Unknown basis, source years,
owners, adjustments, duplicate or stale originals reject. Other residencies,
spouse/joint allocation and business/reward/special treatments need successors.

The calculation uses adaptive local Decimal precision, aggregates the signed
class once and rounds the reported class once. A class loss cannot offset wage
income. With proceeds100.49, PA basis80.24 and federal basis90.24, the independent
PA gain is20.25, reported20; wages50000 yield PA income50020 and tax1536.
The unchanged federal original retains its distinct gain10.25.

Positive unrounded PA withholding requires both actual remittance and
no-payer-refund evidence before aggregation. Actual no-state or zero-PA
withholding needs no invented payment answers. Two actual amounts0.49+0.02
produce0.51, reported1, once. Other-state withholding is retained and needs its
own credit/refund method rather than becoming a PA payment.

The real state panel starts with unknown answers/year and source indices. Only
explicit confirmation retains current private originals. Subsequent edits
revoke the class and parent confirmations. Read/replay never refreshes evidence.

## Source-first execution and independent review

Base main: `1286e693`. All15 author paths matched their frozen before hashes.
Main first installed only specs and controls:12 integration cases produced the
five intended failures and seven guard passes, without missing-module errors.
Log SHA256 `c4c44f05e973e4d4d1592eb79a0ee6f07423597e270ed77f7af638a8103411f0`.

The initial distinct review found two genuine zero/no-state usability failures
among16 cases. Its original14pass/2fail receipt remains immutable. The narrow
correction requires payment proofs only for positive raw PA amounts; it changes
one product condition and preserves all original controls. An additive
independent case checks all eight null/false per-original/per-proof denials for
positive sub-dollar amounts. No test amount or existing assertion was relaxed.

Corrected author freeze SHA256:
`43103e1c27b2d122e9779cef5722e901b30161168feeb189eb53377305847932`.
Complete frozen archive:
`d4172ee9a8dff2e10b12555d16ca4e89b960c8bd7d5f874a62d3bc83741ad745`.
Distinct corrected review:
`9b2f6040de9806abefedcc7176e46b390b95f33763743bd454b24a3a7dab7e4f`.
The reviewer independently ran unchanged17 controls and author24:41/41 pass.
This is independent agent review, not qualified human tax review.

## Main verification and remaining work

Exact main products and all five independent-control files match the freezes.
Main753 tests across12 files pass, including the strict AST spec catalog;
all three type checks, spec7043, inventory generation/check, strict owned lint
with zero warnings, engine/web builds and diff checks pass. Evidence stays
ignored under `.local/upgrade-evidence/nov03-parent-pa-digital-main*`.

The preceding complete main run at1286 recorded21418pass/21fail/33pending from
21472 cases. Result SHA256:
`fbf4a0b14ef545c41ca44ab20d26b1dbd5db132ea1fd4b0af7f05ac88791dfbb`.
Its failures are retained and being addressed; this scoped package does not
claim a complete current suite or a coverage percentage.

- [ ] Actual official D mapping/continuations, saved-output inspection and review.
- [ ] Genuine complete-source digital preview/workspace/browser scenarios.
- [ ] Remaining residency, ownership, income-class and special methods.
- [ ] Final2026 assets, qualified human review and every release completion gate.

No filing/model promotion, production deployment, live AI spend or real taxpayer
document transmission occurred.
