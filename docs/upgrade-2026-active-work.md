# Active 2026 upgrade work

Resume here, then read the execution brief and the referenced package ledgers.
This compact index supplements the historical progress/checkpoint; it does not
replace completion criteria. The goal remains active. Release readiness is false.
Selected launch states are PA and Ohio, all three residency categories.

## Delivered November 2, latest continuation

| Commit | Package | Main verification | Independent agent verification |
| --- | --- | --- | --- |
| `0b3762e4` | Actual PA W2 withholding rows, once | 772 tests/25 files, nine package checks | 90 tests/four files |
| `b58e91ea` | Typed PA completion-source model/collector/panel | 793/27, nine checks, spec6740 | 61/four, exact schema parity |
| `8e757958` | Reciprocal employee withholding needs refund/source method, not G-L credit | 383/seven, nine checks, spec6741 | 367/six;22 new controls |
| `b8661656` | Actual Ohio dated receipts through fresh PartI/PartII and return | 343/seven, nine checks, spec6746 | 351/eight;8 new controls |

All four commits are pushed to `upgrade/2026-baseline`. Scoped warning counts
remain unchanged; no thresholds, guards or readiness gates were reduced.
Package ledgers contain official authorities and full private evidence locations.

## Current internal implementation queue

- [x] Delivered `75846e7e`, OH withholding PDF package7: copied from immutable author manifest
  `nov02-oh-w2-reference/frozen-author-v1/frozen-package.json`, hash
  `acac6295c6b82969a0ee30e0f99a2b6a91a08dedd2eecc5849ed75282289d445`.
  Independent review approved42/four plus25/four legacy controls;93 PDFs/226pages
  reopened,69 own pages visually reviewed. Main68/eight/all9 checks pass.64 PDFs/157pages reopen;167pixel comparisons exact.
- [x] W2 jurisdiction successor, main103/10/all9 and independent118/11: source rows currently restrict PA/OH;
  implement actual valid US50+DC source rows and actual interview selection.
  This does not qualify other state returns. Keep all owner/year/amount/duplicate,
  original/continuation and monetary guards. Source-first55fail/3pass and exact final9 retained.
- [ ] PA resident-credit originals6: source/spec/tests first;16/17 pass with
  unchanged positive DE withholding800+actual payment1200 giving capped credit1535
  now green17/17 after exact reviewed jurisdiction dependency above. Upstream precision correction and independent review remain. Preserve that real failure and
  all original oracles; do not replace it with a passing unsupported-method test.
  Full incomplete6 and20 dependencies: `nov02-pa-resident-credit-sources/incomplete-author-v1.json`.
- [ ] Root shared state integration private source:
  `.local/upgrade-work/root-state-integration-v2/source`. Historical current06
  manifest16 remains a dependency snapshot, not a claim for later source.
  Canonical PA roots/model extraction: genuine4red to75/10green plus all three
  types/spec/lint/build. Exact5 frozen in `nov02-parent-pa-canonical-roots`;
  independent88/11 approved; standalone main105/seven/all9 checks pass. Canonical admission `b572afcd` is committed and pushed; full shared integration remains private.
- [ ] Root PA actual bridge/preview: genuine5behavior failures, then all5 green
  after complete ordinary/completion binding and all3 composer preview. Missing,
  stale or unsupported state facts preserve federal AGI50120. Frozen sources and
  originals in `nov02-parent-pa-shared-paths`. Workspace/PDF integration remains.
- [ ] Saved generic state payment reconciliation: actual duplicate overlay,
  mismatch, unsupported additional withholding and ignored PA100.01 each proved
  a real failing control. Minimal exact-receipt reconciler written after4red;
  first rerun found one obsolete residency-only PA setup; actual complete-source fixture migration retains assertions. Second green36/six plus types3/spec/lint/build passes; independent33/four approved. Evidence: `nov02-parent-state-payment-reconciliation`.
- [ ] PA state panels/navigation/invalidation3: agent private archive
  `.local/upgrade-work/pa-completion-state-panels/source`;19 source controls
  genuine18red/1pass then19green. Generic-ledger guard2 proved real red, then21
  green. Bounded86/10/types/spec/lint/build and independent37/four approved; main integration pending. Root does not edit these
  three owned files concurrently.
- [ ] Adopt reviewed OH payment collector5 with main checks; complete source-aware
  PA/OH preview/workspace/export, actual local/SD/credit/payment/household methods.
- [ ] Reconcile every remaining finite required method in the execution brief;
  source-preserving guards are not completed implementations of those methods.
- [ ] Final exact-head full suite/coverage/types/spec/inventory/build/lint/browser,
  remote CI, ARM64/AMD64 runtime/recovery/SBOM/scans after integration.

## External qualification gates

Existing requests remain outstanding: qualified human tax/spec/artifact review;
authorized hosted staging auth/Postgres/Redis/Stripe-test/webhook/SMTP access;
exact provider account/candidate/period/spend authorization and independently
reviewed synthetic/held-out AI labels; independent human security/privacy review;
owner decisions on80 OS advisory IDs by November7; final2026 official forms and
qualification. No provider funds, model promotion, filing enablement, production
deployment, publication of runtime images or readiness claim is authorized here.

The current IRS1040 and Schedule1-A PDF endpoints still serve2025 forms on
November2. Repository/PR13 head was refreshed at `8e757958`; later b866 push was
confirmed. Historical global CI/coverage/image records keep their original commit
boundaries and are not current-source qualification. Independent agent review is
not the required independent human review.

All new private work stays under ignored `.local/upgrade-work` and
`.local/upgrade-evidence`, retaining full source copies, patches, source-first
spec/tests, genuine failures, check logs and immutable hashes. Preserve unrelated
`.pnpm-store/` and `docs/reviews/`. Never run Node concurrently without the current
root-agent slot handoff; do not run git status/diff inside archive-only trees.
