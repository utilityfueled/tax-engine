# Ohio actual W2 withholding consumer successor

Status: isolated source/adapter successor implemented after genuine red. Bounded checks pass; independent review remains pending. No main edits.

Scope owns only `oh-payment-source.ts`, `oh-input-adapter.ts`, and this package's new spec/test/fixture/ledger. The durable exact committed private base is recorded in `.local/upgrade-evidence/nov02-ohio-payment-sources/w2-consumer-successor/ownership-before-edits.json`. Dated integration, actual W2 source model, residency method, shared guided UI and form qualification remain separate.

Official source refreshed November 2, 2026: final 2025 Ohio IT 1040 booklet printed pages 17/47. IT 1040 line 14 includes only Ohio state income tax withheld. W2 Box 15 identifies the state; Box 17 supplies withholding. PA, city and school district amounts are excluded. Booklet SHA256 `931b21e7484ba96e561cf2346d8a7d2a8005bd990724b5903c9a90acede5f50e`.

Trace confirms two gaps: payment projection requires a legacy scalar even when complete canonical actual rows prove withholding; adapter passes only scalar state/Box 17 to the withholding schedule and loses an actual second Ohio row. The existing full canonical W2 source validator supplies owner/year/current-original/row/projection/duplicate proof and must run at both consumer boundaries.

Synthetic originals fixed before outputs: one federal W2 100,000 with PA first withholding 1,535 and OH second withholding 1,000. Expected Ohio tax 2,323, remaining principal 1,323, existing endpoint penalty cells 4/11/22/19 = 56 and total due 1,379. Independent Decimal receipt is `independent-decimal-before-output.json`. No extra W2 economic original or fake legacy OH zero is introduced.

- [x] Official sources and complete consumer trace before spec.
- [x] Spec before fixtures/tests; existing products unchanged.
- [x] Synthetic positive/zero/unused scalar and identity controls; every nonW2 metadata guard retained; unbound overrides and hidden positive local withholding remain blocked.
- [x] Genuine red before product: 8 failed / 4 passed on both unchanged existing products; exact log retained.
- [x] Implementation after red; first output 185 tests / 6 files green, preserving all 12 literal author controls and original source/adapter/schedule/canonical controls. Root/web/contracts types and Ohio specs 337/337 passed. Payment source/new test/new fixture strict lint has zero warnings; adapter lint passed with only its two unchanged pre-existing district-parser non-null warnings.
- [x] Immutable six-file source copies, candidate patch, hashes, base ownership and checks frozen as `state-02-green`.
- [ ] Independent review; no reviewer outcome is claimed.

This package does not qualify actual local/school district reconciliation, arbitrary dated payments, late prior returns, physical source schedules, filing, provider promotion, public hosting or final 2026 tax law/forms. No readiness gate is changed.


Independent review and main adoption

Independent12 probes plus185 author/related cases pass197 tests/seven files,
with exact frozen6 and4184 unowned files unchanged. Review receiptSHA
9293c0daeb36b742e441787d5bf92ea902617db2b9c98b03db194560bd89d50c.
Main302 tests/nine files, all three types, spec validation, inventory/check and
library build pass. Owned lint has0 errors and2 existing adapter nonnull warnings;
other owned product/new tests pass strict zero-warning lint. Checks/full source
copies/patch/hashes: `nov02-parent-ohio-w2-consumer-main*`.

This delivers actual OH Box17 consumption in the canonical adapter/payment
source only. The separately identified OH reference withholding PDF seam still
uses legacy scalars for support pages and remains required internal work; it must
use the same validated private originals before those paths can be qualified.
Dated pipeline, complete state/guide/forms and human/current2026 qualification
remain separate. No filing readiness gate changes.
