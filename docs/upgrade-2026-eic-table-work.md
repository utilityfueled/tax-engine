# EIC table and statutory ceiling correction

The previous credit calculation subtracted the phase-out reduction from the
taxpayer's phase-in credit. IRC 32(a)(2) instead limits that credit by the maximum
credit less the phase-out reduction. A claimant with $1,000 earned income,
$30,000 AGI and one qualifying child must retain a credit; the previous result
was zero. The final 2025 table gives $349, and the isolated 2026 statutory
calculation gives $340.

Final 2025 also requires the EIC table in the credit worksheets. The former
specification's distinction between software and paper calculations had no
source support. The new helper reproduces all 1,374 rows and 10,992 credit cells,
including all eight partial-row footnotes, from the official Publication 596.
Worksheet lookups apply the earned-income and AGI constraints independently.
Only joint returns use the joint columns; the separately reviewed claimant and
qualifying-surviving-spouse corrections are retained.

The 2026 calculation retains its own indexed statutory values and correctly
rounds the three-child maximum from 8230.50 to 8231. This is not a qualified 2026
table. Final table/form availability and independent human qualification remain
release gates, and public 2026 calculation and filing remain unavailable.

## Sources and reproducibility

- [Final 2025 Publication 596](https://www.irs.gov/publications/p596), EIC Table,
  Worksheets A/B and the Grey example; retrieved 2026-10-26T03:52:13Z. Saved HTML
  SHA256: `a56c478c9ae196fdba9fe10ed94ee123f3a734b71809eb4ae92f7a23e4845f64`.
- [IRC 32(a)](https://uscode.house.gov/us/usc/119-120/t26/s32/), phase-in and
  independent maximum-credit phase-out ceiling; retrieved 2026-10-26T03:52:14Z.
  Saved HTML SHA256:
  `52ee1584cd927d3cc7ce8dbdf8082a361fe110a52b7b394eec23d066ab61f157`.
- [Rev. Proc. 2025-32](https://www.irs.gov/irb/2025-45_IRB), section 3.06, supplies
  the previously researched 2026 indexed values. It does not supply a final
  EIC table or qualify the complete return.

`scripts/extract-eic-table-2025.py` reads a retained official HTML file offline.
It checks the year, 1,374 contiguous intervals, eight complete footnotes and all
starred positions. It transcribes published values without importing an engine
formula. The fixture retains source URL, retrieval date and file hash, with one
row per line for review. Reproduce or check it with:

```sh
python3 scripts/extract-eic-table-2025.py /path/to/p596-2025.html \
  tests/fixtures/eic-table-2025.json --retrieved-at 2026-10-26 --check
```

## Verification

The specification and four source-linked tests preceded the calculation
change. All four failed on the old implementation. The corrected tests compare
every published cell, both ends of eligible intervals, all final cutoffs,
original cents and the IRS Grey example: earned 33030/AGI 33555, joint/two
children, credit 6498. Invalid inputs and unavailable table years fail explicitly.

The first full regression recorded 18,117 passes and two failures in 1,045 files,
with no skips. Both failures were downstream refund expectations using the old
formula. Published table rows independently give 384 at income 5000 and 312 at
income 15000; therefore the corresponding refunds are 1384 and 812. Their literal
expectations and source explanations are corrected without weakening checks.
The other 39 obsolete formula expectations were updated against the retained
published fixture; exact statutory intermediates remain tested separately.

The final focused run passes 257 tests in five files. Root type checking and all
5,019 spec references pass. Scoped lint has zero errors and 15 existing warnings
in the unchanged parts of the full-return test. The offline extractor reproduces
the previous fixture exactly before formatting and verifies the formatted file.
Full regression on immutable `2ec6fb6a` passes 18,120 tests in 1,045 files with
zero skips or failures (609.41 seconds), including real disposable PostgreSQL
ledger tests. Separate independent source/software review passes 261 tests in six
files, including four additional private controls, and reproduces the official
fixture independently. The reviewer identified one citation-only regression;
the committed IRC 32(b)(2)(B) joint-threshold citation is restored. The later
claimant-source integration requires an explicit synthetic negative answer to
the qualifying-child-of-another-taxpayer question; the 2026 calculation fixture
now carries that actual answer. Final combined rebase checks on `6619855` pass 273 tests in eight files plus three rule-pack metadata tests, root types and 5,049 strict spec references. Scoped lint retains zero errors and the same 15 existing warnings. The offline source extractor again reproduces every published cell and footnote. Metadata is `2025.109` / `2026.106-law-integration-draft`.
These results are separate from human tax qualification.

Local evidence is retained under `.local/upgrade-evidence/eic-table-*`, including
the initial failing tests, full initial regression, source manifest, 39-value
expectation provenance and final focused results. The first full failure log remains preserved. The integration commit is identified
by this evidence document in Git history; the durable central checklist records
its exact hash after publication.

## Final integration evidence

The final calculation blobs match the independently reviewed immutable tree.
The only post-review source deltas restore the corrected citation and add an
explicit synthetic Rule10 answer required by the later claimant package. No
readiness gate or qualification status changes. Local log SHA256 values:

- `eic-table-full-final.log`: `2547cccd8c7296f58da2f261cced515352f063f5152329ee327274c957756f5e`.
- `eic-table-final-integration.log`: `8c7d5fcb4cbc221730e0c65854a8d64ccede75e69099285304e888121fdaccff`.
- `eic-table-final-metadata.log`: `aa422530ebdc31b730d8b5ae815bf9b4913ed685c8310e551464b8b0a56033ed`.
- `eic-table-final-types.log`: `5888bcaa4f681b3f7bf48999ae0817c16b3af178b8c13f7d91414fdef8ea04d9`.
- `eic-table-final-spec.log`: `404ebde3e19bb5bb484bd02cf8c3fda97515207f0c867e26a4296460fbf94c37`.
- `eic-table-final-lint.log`: `70695928506df0ef7ddb97da25ff3e17e4a02919e4c5103576a5f3609bf09607`.
