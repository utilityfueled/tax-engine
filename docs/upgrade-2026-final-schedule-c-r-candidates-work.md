# Final 2026 Schedules C and R: disabled physical candidates

Prepared November 1, 2026 from the exact IRS sources in the [refresh record](upgrade-2026-refresh-20261101.md). This package maps physical fields only. It performs no tax calculation, reads no taxpayer return, and is absent from all review/filing registries and public exports. Tax year 2026 stays incomplete and exports remain disabled. Independent human mapping and tax qualification are pending.

## Sources and contracts

- Schedule C: official final 2026 two-page PDF, created May 15, 2026; SHA-256 `cc44e7d1150e54d991835814c1191f60a32617730ca9e50e6f532b51293a86b4`. The current official Schedule C instructions endpoint still identifies 2025. The candidate cannot establish the complete 2026 source rules.
- Schedule R: official final 2026 two-page PDF, created April 21, 2026; SHA-256 `945275e6be3cc7353a3faf165ddd7ccb79e3c8a43abe6678d4c47f8207594cb5`. The official Schedule R instructions endpoint identifies 2026. Final source availability does not itself qualify the implemented eligibility rules or the final export.
- All four actual blank pages were rendered and visually inspected. Separate pypdf canonical-field/widget inventories and pdfplumber word boxes retain every physical page and rectangle. There are 109 fillable Schedule C leaves and 27 Schedule R leaves. The larger canonical counts, 116 and 32 respectively, include non-fillable group nodes.
- Every leaf has a semantic key, actual full field name, page number, type and original four-coordinate rectangle. The original contracts are in `tests/fixtures/pdf-2026/`; they were written before the candidate implementation.

## Differences from 2025

Schedule C's address now has separate street, apartment, city, state and ZIP widgets. Its new line 16b is vehicle-loan interest, while line 16c is other interest. The old other-interest line 16b cannot be reused. A later complete-data filler must obtain and conserve actual business vehicle-loan interest separately, using Decimal, and distinguish it from personal vehicle interest on Schedule 1-A. This package does not fabricate that allocation, add an aggregate alias or activate a filler.

Schedule R's printed line 14 now references Form 1040 line 11b. The candidate records that cross-reference explicitly. Identical field names or unchanged credit arithmetic do not permit reuse of a different year's source bytes or constitute eligibility/form qualification.

## Verification sequence and limits

Official source retrieval and original field contracts preceded the spec YAML and failing spec-linked tests. The retained red run failed both suites because the candidate modules did not yet exist; no test cases executed. Only then were the two immutable maps implemented. The maps contain no calculations, result adapters or side effects.

The private candidate passes 17 tests in five files, including eight new mapping cases and the existing Form 4952/template/export controls. Root typecheck, scoped ESLint and spec validation pass. No calculation, export registry, coverage setting or threshold changes. A complete integrated test/coverage/build/browser run is still required after adoption.

Separate pypdf logical/widget checks and pdfplumber coordinate text checks pass 790 assertions across the two saved interactive diagnostics and all four pages. They use the original source contracts written before the implementation. The reader initially attempted to extract interactive appearance text directly and found empty text in all text widgets; that failed receipt remains retained. The corrected reader paints the saved existing appearances into separate intermediate derivatives before coordinate extraction. Original PDFs, expected values, rectangles and all original assertions are unchanged. This is a reader correction, not a mapping or amount change.

All four actual diagnostic pages were rendered with form appearances enabled and visually inspected. The new vehicle/other interest boxes and all address components are distinct and legible, Schedule R's AGI cross-reference is visible, SSN probes contain REDACTED, and every page has a readable review-only notice. Multiple checked status boxes and one-digit values are deliberate field-location probes, not a valid taxpayer return. These tests do not exercise real facts, a complete guided journey, tax formulas or final human qualification.

Local receipts, source inventories, red log and subsequent checks are retained under `.local/upgrade-evidence/nov01-refresh/`. The execution brief retains all remaining criteria.


## Parent physical review

Parent review verifies all eleven frozen hashes, 136 unique leaf widgets,
canonical/widget values and appearance presence in both saved interactive PDFs,
and the review notice on all four pages (569 grouped checks, zero failures).
All four actual diagnostic pages were visually inspected, including the new
Schedule C vehicle/other-interest rows and split address. These diagnostic
combinations do not represent a taxpayer return. The maps remain unregistered;
final scenario/instruction and independent human qualification are pending.
Evidence: `.local/upgrade-evidence/nov01-parent-c-r/receipt.json`.

Main verification passes 11 tests in three files, root type checking, spec
validation, inventory freshness (604 entries) and scoped lint. The evidence is
`.local/upgrade-evidence/nov01-parent-c-r/main-checks.json`. Filing and review
registries retain their existing 2026 rejection gates.
