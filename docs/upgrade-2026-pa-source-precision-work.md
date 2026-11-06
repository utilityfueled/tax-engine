# Ordinary PA source arithmetic precision

The ordinary residency source method could round an intermediate value across
a half-dollar tax boundary or reject a complete60-digit payroll reconciliation.
A local Decimal precision100 context now preserves the independently exercised
source values. The global Decimal configuration, source facts and reporting
rounding policy remain unchanged.

Spec: `spec/state/pa-source-precision.yaml`. Authority: [2025 PA-40 instructions](https://www.pa.gov/content/dam/copapwp-pagov/en/revenue/documents/formsandpublications/formsforindividuals/pit/documents/2025/2025_pa-40in.pdf).
2026 use remains draft. Literal monetary oracles were calculated with independent
Python Decimal150 before product output. The19-digit boundary produces exact
30700000000000078.4999 and reported30700000000000078; the neighboring source
reports30700000000000079. The60-digit control also verifies source reconciliation.

Main source-first red:2failed/1passed before the product edit. Green:90tax tests
in five files, root/web/contracts types, spec, strict owned lint, inventory check
and library build. Inventory mapping/check tests also pass. An initially stale
inventory failed as intended; regenerated inventory retains partial status and
missing packet/e-file gates. One initially requested nonexistent reciprocity test
path was corrected to the actual nine-test file and run separately.

Independent agent review:25controls/three files, root types and strict lint pass.
That review covers the finite source scope exercised up to60digits. It does not
qualify unrelated ordinary-facts/PA-40 precision, unbounded sources above the local
context, final2026 forms or filing. Agent review is not qualified human tax review.

Durable ignored evidence: `nov02-parent-pa-source-precision-main/` under
`.local/upgrade-evidence/` includes full before/final sources, true red/green logs,
commands and hashes. Independent receipt SHA256:
`acd4c1790692c2d6381df092e01ed03e987273afe2a95aad130f8fa09487b74c`.
Full-suite/coverage/browser/runtime release qualification remains pending.
