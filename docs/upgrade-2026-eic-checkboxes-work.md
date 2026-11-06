# Remaining actual EIC printed conditions

This metadata-free source/PDF package follows the separate Rule10 line27c
mapping. It projects the other expressly instructed claimant conditions onto
the final2025 Form1040 without changing eligibility or credit arithmetic.

Official sources refreshed 2026-10-26 UTC:

- [Final2025 Form1040 instructions](https://www.irs.gov/instructions/i1040gi):
  line27a Step1 question2, the nonresident-alien definition and resident-election
  exception, Step4 question3, line27c, and the2025 Residency explanation.
- [Final2025 Pub596](https://www.irs.gov/publications/p596): Rules2,4,11 and14,
  including either-spouse age, actual death dates and military-duty treatment.
- [Final2025 Form1040](https://www.irs.gov/pub/irs-prior/f1040--2025.pdf): page1
  home checkbox `c1_5[0]` at `[568,637.251,576,645.251]`, and page2 line27c
  `c2_13[0]`. The official template hash remains the one recorded by the prior
  Rule10 review package.

The pure review helper reuses the canonical claimant source validator and age
method. Known false work-valid SSN answers or a known nonresident restriction
set27c; the actual joint resident election is preserved. The childless age
condition uses both spouses and known alive/deceased source answers. Missing
historical death status is not converted to year-end survival. A childful
claimant is not subjected to the childless age or home restrictions.

The page1 home mark requires actual confirmed home answers for each required
claimant. It does not derive a home from general residency months or a child's
facts. Counted foreign military duty needs the actual qualifying order record;
an incomplete preserved home record cannot establish an affirmative mark.
False remains distinct from unknown. Source contradictions and any stale
positive EIC against a required27c condition reject before PDF access. An
income- or dependency-based zero does not itself establish a27c instruction,
and no voluntary opt-out election is manufactured.

The five spec-linked saved-PDF cases first failed on the existing mapper, with
missing27c or home marks. Red evidence is retained privately in
`/private/tmp/tax-release-prereq-review-UEk43F/eic-checkboxes-red.log`.
The source helper then passed the five cases; a subsequent adjacent assertion
identified only the existing Rule10 diagnostic text contract, which remains
preserved. Permanent tests cover actual false/unknown SSNs, joint election,
either-spouse and death-day age, joint homes, military orders, stale results,
source immutability, and controls for zero credit without a printed condition.

The final2026 PDF and filing qualification gates remain closed. No metadata or
calculation module changes are included. Final exact checks, independent
review and saved/rendered artifact evidence are recorded below.

## Exact verification and independent review

The frozen source tree `71ef657e02247e1fad7a88d846538bd101bc1e5d` passed 1,271 tests in 170 files (the full PDF cohort plus workspace, claimant and strict spec consumers), root types, all 5,063 spec references, and scoped lint. The two original two-page joint-return review PDFs were independently reopened: true homes retained EIC649 with the page1 box checked and27c blank; the actual spouse-homefalse control retained zero EIC with page1 blank and27c checked. Both widget values and appearance streams, redacted identifiers, review footers and all four rendered pages were inspected. Saved file SHA256s are `4a612069155c04ce88bec49003bb2a603db9b4f82ef4356e36bf62928654d6b4` and `68e3a1c45f010b89b2b5f8609b215595863d6e387b1ed79bf2bc7903a3028f47`.

Parent independent review verified all five frozen hashes on `76e3538`, passed 54 tests across seven files including three independent source controls, and separately inspected the marked page1 and27c renders. No actionable finding remained in this bounded mapping/source package. Agent software/source review is not independent human tax or form qualification. The separate all-claimant guided home controls and separated-spouse source method remain follow-up packages; this commit does not claim those completed.

Final scoped integration on `76e3538` passed all 48 tests in six files, including the existing Rule10 mapper, workspace download path, claimant sources and strict spec checker. All four reviewed executable/spec/test SHA256 values were reverified unchanged before staging. No metadata or readiness gate changed.
