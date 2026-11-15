# Training-guide return years

The IRS rolling `p4491.pdf` now serves the 2026 training guide. Treating that
filename as the retained 2025 sample mislabels newly uploaded material. The
January 2026 revision of Publication 4491-X covers **2025 returns**, so its
revision date also cannot establish the return year.

The sample registry now uses the official
[accessible 2025 guide](https://www.irs.gov/pub/irs-access/p4491_accessible.pdf).
Its downloaded body exactly matches the retained sample: 27,347,185 bytes,
356 pages, SHA-256
`13b6ef6372f32e70d0fbb1e0d71078bc056b119c9da07ddf75d20f101e04891a`.
The [current 2026 guide](https://www.irs.gov/pub/irs-pdf/p4491.pdf) is
22,529,367 bytes/350 pages, SHA-256
`85d627de33310ee10e5cc0fc1ea855cfcaf6559c4f085b77854db45c3c5c49fa`.
The [2025 supplement](https://www.irs.gov/pub/irs-pdf/p4491x.pdf) is
2,796,083 bytes/42 pages, SHA-256
`d3cd3b8287be84b39faaf9085f34f5dfd1c0f34cd56b64be64414f5ab6187c0b`.
These are November 15 observations; future downloads must verify the actual
body and cover again. No rolling URL is declared immutable.

All fifteen sample IDs and retained sample bytes are preserved. Generic rolling
publication filenames no longer assign a year. A recognized guide cover is
classified before its example W-2/forms: one unambiguous printed RETURNS year
becomes documentary metadata, while absent/conflicting years remain unknown.
A misleading taxpayer-form filename cannot turn guide examples into taxpayer
facts. The supplement's legacy ID remains stable; its year hint is corrected to
2025. Explicitly saved document and workspace years remain unchanged.

The native supplemental source policy admits only the exact new accessible URL
in addition to its prior allowed URLs. HTTPS/origin, per-file 32-MiB, aggregate
64-MiB and 32-entry bounds remain. Browser source metadata changes only three
hashes and the dependent optional-diagnostic audit digest: all case selections,
request budgets, worker counts, retries, deadlines and finite audit members stay
unchanged. No training material establishes actual taxpayer facts, final-form
qualification or calculation/filing readiness.

Spec and tests were applied before implementation. The actual checkout regression
fails four cases and passes 121 on the old implementation. After the reviewed
change, all 176 focused tests in six files pass, including actual PDF.js upload
and workspace propagation. Four additional private checks exercise original
official first-page projections; these are separate from the synthetic permanent
regression PDFs. The independent reviewer passes 186 checks in eight files.
Contracts/web types, scoped lint and spec validation pass. All 91 browser metadata
controls pass after updating the dependent digest; its initial stale-digest
failure remains recorded. Inventory regeneration adds five references and retains
1,043 entries.

Private source review `c2458ea6…` verifies all 74 proposal pins, the nine changed
paths and unchanged application dependencies. Its documentary base distinguishes
the `8cc5b0ec` application from the subsequent documentation-only `b5f6e2d4` head.
No services, provider calls or VM operations occur in this source package.
Full combined-source and distribution checks follow; earlier runtime evidence
remains bound to its named application commit. Qualified human review, final
annual forms, strict Linux failures and security/release acceptance remain open.

## Full-suite spec-reference correction

The exact `23494de5` full unit and coverage runs each retained 28,855 passes
and one failure:
`validate-testrefs.test.ts` could not discover this spec's references because its
existing parser requires double-quoted line and testRef scalars. The earlier
YAML-aware spec command accepted the same values. The failed run and its normal
owned PostgreSQL shutdowns remain recorded; neither is an all-twelve pass.

The correction changes only eleven scalar quote styles in the spec, preserving
all parsed values, source authority, formulas and five test references. The
existing validator and every application/test implementation remain unchanged.
Root then passes 957 tests across the reference-validator and training-guide
files, all 9,385 spec references and the unchanged inventory check. Independent
parsed-value/reference review passes (`1404d993…`); it also verifies
the unchanged validator and all five actual target names. A fresh combined-source
run follows.
