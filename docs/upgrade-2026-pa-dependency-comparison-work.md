# Reuse an identical state-source dependency comparison

The bounded guided-flow change removes one repeated comparison only when both
previous and incoming state records have all three PA packet fields strictly
undefined. Incoming data must be a non-null, non-array object; previous data
must be absent, null or a non-array object. The result already computed for the
whole section is reused for either changed or unchanged sources.

Retained, removed, null, false, empty or malformed PA packets follow the existing
PA dependency projection. Previous/incoming primitive and array shapes retain
their existing behavior. The three specialized PA comparisons, Ohio source
confirmation/invalidation, original records, durable commitments and fresh
federal replay remain unchanged. This changes no calculation, tax rule, money,
privacy control, readiness gate, timeout, worker setting or dependency. The
comparison equivalence is bounded to ordinary saved JSON and typed application
data, without a claim for side-effectful accessors or arbitrary proxies.

## Evidence before adoption

The historical flow SHA256 is
`172d0977a483c0148bf9daf96887d92b98bc610a408e0b4ba4f1e041f9e6f0f4`;
the adopted flow SHA256 is
`2c982491c1ea82b48e1f0a58a08fd5e3e4b818c8668f92b002a7e26b2b60ca2e`.
The generic source comparator remains
`15b8f5e98b6b8c5e96ff9675ddcb63cd6696bcff39ae8a9df5f4278f93ad58f7`.

The author executes 73 complete-function cases using existing fictional PA/OH
fixtures and 626 pinned build inputs. Complete structures, input/output reference
relationships and frozen input immutability match: 72 returns and one retained
malformed-packet TypeError. A distinct agent independently rebuilds the bundles,
verifies all input pins and repeats all 73 cases, plus 1,225 comparison pairs
including 80 eligible pairs. No critical or warning finding is reported within
the saved-data contract. Agent engineering review is not professional tax review.

The fixed CPU experiment retains all 16 fresh-process samples in eight
alternating baseline/proposed pairs: 100 warmup and 400 measured updates per
process, 6,400 measured updates total. Median CPU per 400 updates is
168.1325 ms versus 104.293 ms; median paired proposed/baseline ratio is
0.623605 (range 0.614414–0.672864). This is about 0.16 ms saved per update in
that fixed mixture. It establishes neither whole-browser improvement nor
clearance of the unchanged 30-second image-browser deadline.

The first measurement harness failed an invalid cross-deserialization V8-byte
comparison without producing a timing sample. The corrected harness compares
the same frozen object's before/after encoding. The independent review separately
retains four rejected fresh-heap checksum diagnostics and uses structural and
reference parity instead. No failed attempt or sample is discarded; no product
assertion or workload is weakened.

## Package validation

Current-main focused controls pass 505 tests in 18 files, zero failures or
pending tests, with two workers and the unchanged five-second unit deadline.
All eight static/build/lint checks pass: three typechecks, spec validation,
inventory, engine build, web build and lint. Lint retains 11,715 warnings and
zero errors with no semantic additions or removals against the recorded b254
baseline. Six new durable regressions pass through the normal test runner and aliases
with the unchanged five-second deadline and two workers. They cover unknown
versus zero without invented packets, removed PA facts, retained cross-state
completion, primitive replacement, array/record copying and retained malformed
packet errors. Root typecheck and exact-file zero-warning lint also pass. The
same proposed behavioral cases previously passed both baseline and successor;
they pin behavior rather than comparator-call counts or implementation mirrors.

Fresh exact045fbedb unit and coverage each pass25,244tests/1,854files with zero
failures or skips, including all six real PostgreSQL files (53 assertions).
Coverage91.81/87.54/90.69/95.03 and all eight remaining checks pass with unchanged
gates; lint has no semantic delta. Source exactness and database cleanup pass.
See [the full verification ledger](upgrade-2026-045-full-local-verification-work.md).
New hosted/native artifacts remain required. Historical 8487 full-suite and
image receipts stay attributed to 8487.
No filing, model promotion, release readiness or distribution qualification is
asserted by this package.

## Retained local receipts

Paths below are ignored local evidence, not publicly shipped artifacts.

- `nov04-d815-web-diagnosis/full-flow-parity.json`: SHA256 `bdd00a92a092cf3325a931c210375cd8f1ec542c6893c1a5c74da616d8e15e46`.
- `nov04-d815-web-diagnosis/full-flow-benchmark-v2.json`: SHA256 `fc3bfc97bea26cc24d9c723a924e4d937f6701afe1b3bf4f910e2ebb6017cd22`.
- `nov04-d815-web-diagnosis/full-flow-manifest.json`: SHA256 `15a3a3934c3ae5847381ca259b370e3c920b9e7efb765972e683ab9bad10fe5a`.
- `nov04-pa-dependency-reuse-independent/receipt.json`: SHA256 `9f296c38ec52f704e1c4b9e59d472508e116fb7e2ee9c1b73f2c554dec54d9d1`.
- `nov04-pa-dependency-reuse-independent/manifest.json`: SHA256 `51324a28784612babc6adcf7237655240a5eb91632d70b2658a1b9c53e9f3f63`.
- `nov04-pa-dependency-reuse-main-checks/focused-receipt.json`: SHA256 `46052465c99fcd75ff2c3c321e1df926de6d1888106769694d33fa597adc5c8a`.
- `nov04-pa-dependency-reuse-main-checks/static-receipt.json`: SHA256 `8ae4df7828d012db3d2c47c62444594bbd0449364a8ba4a2271b6849a4de6043`.
- `nov04-pa-dependency-reuse-main-checks/lint-comparison.json`: SHA256 `dc9637eadc517f88df40d8a04c62090e390f7434110d1b4e3053e483f90ecb25`.

- `nov04-pa-dependency-durable-tests/receipt.json`: SHA256 `b8a794fe3ad2abf9695352c6927f2c12f931a16066b728dce2f3062f06e2a0ac`.

All paths are relative to `.local/upgrade-evidence/`.
