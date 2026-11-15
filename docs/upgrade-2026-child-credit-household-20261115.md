# Actual household child-credit contradictions

The shared child-credit admission helper now rejects actual repeated household
TINs, known birth dates inconsistent with an under-17 CTC claim and a dependent
claimed simultaneously for CTC and ODC. The actual authenticated, entitled,
confirmed explanation endpoint previously accepted those contradictions and
produced a server audit; it now returns a private, no-store 400 before provider
or accounting work. Credit formulas and 2026 strict missing-source guards remain.

Only exact nine-digit or 3-2-4 hyphenated supplied identifiers are compared.
Missing, redacted or malformed historical identifiers are not normalized into
another person's identity. Comparison covers primary, spouse and all dependent
rows whenever a CTC or ODC claim exists. Actual valid birth dates are checked in
2025 as well as 2026. Distinct actual children and intentional historical unknown
previews keep their behavior. A no-credit calculation still skips this helper's
claim admission. These compatibility controls do not qualify unknown identity
or age as an actual complete return.

Authority: final 2025 [Schedule 8812 instructions](https://www.irs.gov/instructions/i1040s8),
IRC 24 and Rev. Rul. 2003-72. The ruling uses birthday-anniversary age for CTC;
January 1, 2009 remains under 17 at December 31, 2025. The separate parent-election
Form 8814 age example is not used for this credit. No final 2026 instruction or
independent human interpretation is invented. The
[spec](../spec/federal/child-credit-household-admission.yaml) links all five
actual test declarations.

Actual validation:

- Genuine initial RED: four failing cases and one passing control. Duplicate
  actual child identity previously yielded two $2,200 credits instead of one;
  two distinct actual children retain $4,400. Known adult/future dates and dual
  credit flags reject. Parent/spouse/cross-dependent identity collisions are
  covered separately; employment-valid/timely SSN eligibility is not inferred
  from formatting.
- Author focused checks pass 271 tests; separate source/actual-boundary review
  passes 88 tests and seven canonical probes. Engine types and scoped lint pass.
  Actual confirmed POST asserts private/no-store 400, no provider/accounting
  dispatch and no identifier in its generic response.
- Root first immutable full suite records 28,510 passes and one strict-reference
  failure: the new spec's plain line/testRef scalars were not recognized by the
  existing parser. The original source, logs and failure are retained.
- A distinct successor adds exactly ten YAML quotations, preserving all five
  decoded line/testRef values and every guard, test and parser byte. Actual
  targeted RED is 938 passes/one failure, followed by 939 passes.
- Root successor `pnpm test --maxWorkers=8` passes 28,511 tests in 2,075 files,
  without added private root tests. Source pins remain unchanged. Its own
  PostgreSQL 16.16 stops normally and private connection/password files are
  removed. This isolated candidate is based on `d9026aea`; root verifies all
  three unchanged destination baselines before adopting onto `8ecac234`.

Private evidence under `.local/upgrade-evidence/`:

| Artifact | SHA-256 |
| --- | --- |
| Original three-file freeze | `fc9ba29e8b281d7dd9b709200f1a64d54da062328c0ef1d527a99b619f482cce` |
| Independent source review | `14aea15852018a8193a11017f4ecb64625bfc0607820554ca3945cb136e3048b` |
| Spec-only successor freeze | `09d572beb1c78e111a041cb17253cff58ab1b645144c1ccc31f9756ddd9f205c` |

Root review and exact full-unit evidence are in
`nov14-child-credit-root-review-v2/ROOT-REVIEW.json` and `full-unit-result.json`.
The original failed full run remains in `nov14-child-credit-root-review/`.
Combined inventory/source binding and final current-source hosted/native checks
remain separate. Qualified human review, final 2026 annual forms/readiness,
filing and model-promotion gates stay closed. Main remains local under the
production push hold.
