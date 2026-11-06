# Actual K–12 prepaid benefits and the cash-distribution cap

Implementation work on October 25, 2026. Rule versions 2025.101 and
2026.97-law-integration-draft retain the existing qualification gates.

## Official sources and treatment

- [IRC 529](https://uscode.house.gov/us/usc/119-118/t26/s529/), refreshed
  October 25: subsection (b)(1)(A)(i) defines purchased tuition credits and
  certificates; institutional programs also need the qualified trust and
  ruling or determination described in (b)(1). Subsection (c)(3)(B)(i)
  addresses benefits provided in kind. The annual K–12 limit in (e)(3)(A)
  specifically applies to cash distributions from savings programs under
  (b)(1)(A)(ii): $10,000 in 2025 and $20,000 in 2026.
- [Publication 970](https://www.irs.gov/publications/p970), chapters 6–7,
  supplies the education expense, allocation and earnings framework.
  Section 529(c)(7) and the statutory effective-date notes retain July 4,
  2025 as the boundary for expanded K–12 expense categories. Under
  section 529(c)(3)(B)(iv), the furnished benefit is its distribution; the
  implementation uses its actual provided date and rejects a conflicting
  statement date or timing answer. Mixed pre/post dates require a separate
  allocation method.

The implementation requires actual prepaid program sponsor, qualification,
redeemed credit/certificate and source reference. Institutional programs also
require their actual trust and IRS ruling/determination evidence. Existing
outside-plan amounts need an explicit cash-only confirmation for this method;
missing answers remain unknown. A direct cash payment cannot be relabeled as
an in-kind benefit. Actual beneficiary identity and allocation conservation
remain required. Broader partial expense groups retain their existing gates.
These numerical controls are derived from the statute; no published IRS
numerical in-kind K–12 example or human tax qualification is claimed.

## Expected controls

A $4,000 actual prepaid benefit with $800 earnings and a separate $2,000 cash
withdrawal with $400 earnings fund $6,000 tuition. Actual outside cash of
$9,000 in 2025 or $19,000 in 2026 leaves $1,000 cash expense capacity. The
prepaid earnings are excluded, $200 cash earnings are taxable and the
additional tax is $20. With $50,000 wages, canonical AGI is $50,200. A separate
$40,000 qualifying prepaid benefit is unaffected by the cash-only annual cap.
Remaining cash capacity of $997.50 versus $997.49 produces $200 versus $201
taxable cash earnings after the existing IRS whole-dollar rounding. Known
ineligible benefits stay taxable; expanded 2025 categories on July 4 remain
ineligible, while July 5 uses the expanded rule.

The guide collects the actual new program facts and preserves unknown/false
answers. The review reference binds program and cash sources to the original
calculation before redaction, displays ordinal labels and amounts, and omits
private program references. Stale sources or missing audits reject before PDF
I/O. Physical 2025 Form 5329 shows lines 5/7/8 of 200/200/20; its existing
currency mapping leaves zero line 6 blank. 2026 and filing output remain gated.

## Verification

- Spec-first core red: three intended failures before the cap/source change.
- Spec-first guide/PDF red: missing visible source controls and missing source
  audit rows, two failures. The first PDF verification then exposed an incorrect
  test assumption about displaying zero; the existing mapping intentionally
  leaves zero currency fields blank, and the test now separately verifies the
  canonical zero and blank field. No calculation assertion was removed.
- Initial core/guide/PDF checks: 11 cases across four files pass, plus one
  canonical 2025/2026 return case. Root/web types and scoped product lint pass.
- Initial frozen tree `29f2f95adfccbfb24c3daaa7c607ff5495be22eb` passed 239
  tests across 38 files, root/web types, 4,956 spec references, root/web builds
  and scoped lint. Production Chromium passed desktop/mobile (2/2, no retries).
  Eight review PDFs were retained; the reference and Form 5329 pages were
  rendered and inspected with private references absent and notices present.
- Independent review found an early furnished benefit could use a later
  statement date to qualify an expanded expense. Its unchanged timing probe
  failed (seven adjacent cases passed). A new owned regression also failed
  before correction. Actual furnished dates now control; a later statement or
  conflicting all-after answer cannot replace them. July 4 stays ineligible,
  July 5 qualifies without inventing a missing statement date, and mixed
  eligibility dates reject. The seven owned cases pass after correction.
- Corrected tree `6da186e53475356374bf434d815af14320b83d4b` passed 456
  tests across 41 files and the unchanged independent timing probes. Its type
  check correctly rejected raw optional benefit dates passed to a string-only
  helper. The final helper accepts the raw optional type and explicitly rejects
  nonstrings; it does not replace unknown dates.
- Final frozen tree `a37aa6da5f139f8d5baacb29ddd64951521609fa`, based on
  `31a1c4a43bd85d0797d1a753e42f16dd57e2c3a6`, passes 456 tests across 41
  files, root/web types, 4,973 spec references, engine/webpack production builds
  and scoped lint (zero errors, one non-null assertion warning in the validated
  institutional-source branch). Desktop/mobile Chromium pass 2/2 with no retries.
  Eight PDFs are retained with hashes; both education reference pages and three
  Form 5329 pages were rendered and inspected. Private source markers are absent,
  every page has its review notice, AGI is 50,200 and taxable/additional amounts
  are 200/20.
- Separate agent review passes 10 cases across six files, including the unchanged
  original timing probes, explicit missing-date controls and stale-source PDF
  rejection before I/O. No actionable scoped finding remains. This is software
  and source review, not independent human tax qualification.

Exact logs: `in-kind-k12-final-exact-tests.log`,
`in-kind-k12-final-exact-static.log`, `in-kind-k12-final-web-types.log`,
`in-kind-k12-final-web-build.log`, `in-kind-k12-final-browser.log`, and
`complete-facts-k12-final-review.log`. Retained documents and hashes are in
`in-kind-k12-final-render/`. The delivered source matches the final frozen tree
apart from this completed evidence entry.

Evidence logs are in `.local/upgrade-evidence/in-kind-k12-*`. The central
checklist will record the delivered commit and remaining release blockers.
