# Actual mixed prepaid, cash QTP, and ESA tuition sources

The bounded method accepts an actual same-recipient tuition group containing
prepaid QTP benefits, cash QTP distributions, and ordinary Coverdell accounts.
Each original statement, benefit, allocation, credit allocation, and ESA basis
history remains separate. The source validator does not choose an allocation,
create basis, or replace a missing source answer with zero.

Official sources refreshed October 26, 2026, at 14:40:15 UTC:

- [IRC 529](https://uscode.house.gov/us/usc/119-118/t26/s529/),
  (c)(3)(B)(i), (ii), (v), and (vi): actual prepaid benefits, cash expense
  remainder, assistance/credit reductions, and QTP/ESA coordination.
- [IRC 530](https://uscode.house.gov/us/usc/119-118/t26/s530/) and
  [Publication 970](https://www.irs.gov/publications/p970), chapters 6 and 7:
  actual qualified expenses and Worksheet 6-3's beneficiary expense ratio with
  separate account basis computations.
- [Notice 2016-13](https://www.irs.gov/irb/2016-07_IRB#NOT-2016-13): repeal of
  the QTP distribution aggregation requirement after 2014.

The numerical controls are independent derivations, not published IRS examples.
Tuition of 8,000 less 1,000 assistance and 1,000 credit expense leaves 6,000.
Actual allocations are 1,000 to prepaid QTP, 1,000 to cash QTP, and 4,000 to
ESA. Their separate earnings computations exclude 200, 500, and 800, leaving
1,500 taxable earnings, a 200 credit exception, and 130 additional tax. Actual
50,000 wages therefore produce 51,500 AGI. The educator variant independently
confirms 700 QTP and 800 ESA excluded earnings; its 2,000 actual expense leaves
500 before the applicable 300/350 educator cap. The two-ESA control retains
the common expense ratio alongside distinct QTP ratios: 2,067 excluded,
2,033 taxable, 300 credit exception, and 173 additional tax.

Each tuition expense requires explicit allocations, including actual zero, for
its linked prepaid statements and every cash QTP/ESA account in the supported
group. Provided benefits reconcile only to prepaid originals. Original
distribution capacities and expense/credit totals reconcile before rounding.
A local Decimal precision context preserves every supplied source decimal
place; global tax arithmetic is unchanged. The existing shared canonical,
educator, guided, and private PDF contexts consume the same validated sources.
The reference page labels each verified statement's actual distribution form.

The initial spec-linked run retained four failures in two files at the existing
unsupported source boundary. The first expanded source run passed eight cases
and failed the new sub-cent conservation control: a 20-digit Decimal sum hid
the supplied 1,000.00000000000000000001 amount. The corrected local source
precision passed nine cases in four files. The reference-label assertion also
failed before the display-only mapper addition. Subsequent working-copy checks
passed root types, two guided/real-panel cases, and two PDF/workspace cases.
The subsequent working-copy cohort passed 731 tests in 54 files, including
strict literal spec references and the adjacent education/private-output cases.
Root, web, and contract types and all 5,495 spec references passed. Scoped lint
reported zero errors and the two pre-existing non-null-assertion warnings in
the source validator.
Exact logs and hashes are retained in `.local/upgrade-evidence/mixed-tuition-*`.
These initial checks are not a final immutable package or release qualification.

The first immutable tree, `17539d43`, passed the same 731/54 cohort, root types,
and production web build. Its desktop/mobile browser fixture omitted the
existing education `claimedAsDependent` answer, so both cases correctly stopped
at unknown eligibility before reaching the new method. The fixture now supplies
the same explicit fictional false answer as the source/DOM fixtures. No product
guard or monetary assertion changed; the original two failures are retained.

The corrected immutable tree `0411cc25` passed 491 tests in seven files,
including the owned source/guide/PDF cases and strict spec references, and its
production web build. The desktop and mobile cases both passed with zero
retries; port 3351 was stopped afterward. They exercised actual allocation
edits, blank versus zero ESA basis, explicit reconfirmation, local reload,
unchanged original statement values, source privacy, and the review download.
The browser change supplies only the missing fictional dependency answer;
all 11 product/spec/unit-test files remain byte-identical to `17539d43`.
Both immutable archives retain all 3,198 original source hashes after checks.

Four retained synthetic PDFs and both final browser downloads were independently
reopened: six PDFs, 124 pages, and 24 literal physical field values. The original
unflattened controls retain matching logical fields, widgets and appearances;
the final downloads are flattened with no remaining widget or field tree.
The browser values were read at the actual official-template rectangles using
their flattened appearance transforms, because plain layout text extraction
omitted those transformed values. Original source identifiers are absent and
every page has its review notice. All six contact sheets/footer strips, the
recorded readable physical/reference pages, and all four desktop/mobile source
and review screenshots were visually inspected. No relevant clipping, overlap,
missing notice or horizontal source-panel overflow was found. Artifact creation
is not counted as an authored test. Exact hashes and page lists are in
`mixed-tuition-artifacts/{generation,reopen,browser-reopen,visual-inspection}.json`.

Independent federal source review of `0411cc25` passed 12 tests in seven files,
including four private controls for distinct cash-account earnings ratios,
per-original capacity, exact 41-place conservation and zero/missing recipient
facts. All 13 owned hashes were unchanged before and after review. The reviewer
also independently reopened and rendered the four retained PDFs, 82 pages and
16 literal fields, without a source or output finding. Its report is
`federal-mixed-tuition-review.json`, SHA-256
`7b822a636e5c4afc745506b64ead0acc57b1169577b9b1dc1a8b0c38d80e594e`.
The private review probes are not copied into this package.

Parent artifact review independently checked all six retained/browser PDFs,
124 pages, the 16 retained physical field controls, actual browser values,
per-page notices and bounded source privacy. It inspected 29 contact, footer,
readable-detail and desktop/mobile images without a layout finding. That
separate report is `parent-mixed-tuition-pdf-review/checks.json`, SHA-256
`026d5ee3a008eb78055069d6407b38fddcbfcd711f3408bbcbaeb791a6212073`.
These are bounded agent software/source reviews, not human tax qualification.

The remaining delivery step is a scoped current-main integration under a
shared-index lease after the preceding reviewed packages. Actual assistance without
ESA and actual room/board academic-period/cap groups remain separate finite
methods. No readiness threshold, filing export, public-year gate, or independent
human qualification is changed or claimed.

## Current-head integration candidate

The final private candidate is based on `cd5e4c7ccf3a47afb55462821ab5805b622e4a0a`, after the delivered health/current-origin charitable packages and documentation-only runtime evidence. The twelve reviewed non-ledger blobs are preserved exactly. The metadata versions advance chronologically to 2025.148 and 2026.145-law-integration-draft, without changing calculation/review/filing readiness. A genuine shared-runtime and historical 2025 review-mapper link is added for this own spec, preserving all 42 preceding implementation links; the inventory is regenerated as 523 entries. These additions are traceability, not final 2026 form qualification.

Final immutable `7d522cf0` passed 734 adjacent/source/strict-reference tests in 54 files, 38 implementation-link/inventory controls in two files, and five rule-pack/public-year controls in two files: 777 tests in 58 files. Root/web/contract types, all 5,526 spec references, the regenerated inventory check and both builds passed. Scoped lint has zero errors and the same two pre-existing non-null warnings. Both production browser cases passed with zero retries, and task port 3351 was stopped. All 3,235 immutable source hashes remained unchanged. The broader test log SHA-256 is `715081d0d8a7af11db09f773b92c37cf3d0cce59a59be1c065a5596b7958c053`; browser log SHA-256 is `22f3cd88d6914357b8e8d8821d96266aca02115c34cf80308b9074c939e9e760`.

Parent independently verified all 16 final hashes, the twelve unchanged V2 non-ledger blobs, all 42 exact predecessor implementation links plus the new bounded link, 523 inventory entries and unchanged public readiness gates. Final delta report: `parent-mixed-tuition-final-delta-review.json`, SHA-256 `b5a571b7769f710e4c794cf721238423137aa31fde8ed00621c5bed5182aef5f`. This final delivery refreeze changes only this evidence ledger relative to the tested/reviewed immutable candidate. The complete-source/form/human qualification gates remain open.
