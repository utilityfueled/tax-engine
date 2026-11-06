# Marriage-year actual payments for an outside child

This private package composes the existing actual outside-child health sources with the elected marriage calculation and the existing Part IV and monthly coverage-family methods. It removes the blanket rejection of positive outside-family cash only when those independent sources establish the supported calculation. The child does not become a member of either alternative marriage family.

## Authority and source contract

Official sources refreshed on 2026-10-27:

- [IRC 162(l)](https://www.govinfo.gov/content/pkg/USCODE-2024-title26/html/USCODE-2024-title26-subtitleA-chap1-subchapB-partVI-sec162.htm), including a child who has not attained age 27 by year end and the business/employer limits.
- [Final Form 7206 instructions](https://www.irs.gov/instructions/i7206), including son, daughter, stepchild, adopted child and an eligible foster child placed by an authorized agency or court.
- [Publication 974](https://www.irs.gov/publications/p974), Worksheet P, specified versus nonspecified premiums, separate business limitations, and alternative marriage Steps 1–8.
- [Regulation 1.162(l)-1(a)](https://www.ecfr.gov/current/title-26/section-1.162(l)-1) and [Revenue Procedure 2014-41, sections 3–4 and section 7 Example 3](https://www.irs.gov/irb/2014-33_IRB).
- [Final Form 8962 instructions](https://www.irs.gov/instructions/i8962), Table 2 and the Part IV/Part V transfers.

The existing common reader already binds each original policy/person/month, full premium, actual payer and person amounts, employer eligibility, actual original advances, and an actual completed other-return Form 8962 with the linked claimant/policies and explicit line 24 zero. An omitted, draft, unknown or positive other-return credit is not converted to zero. Zero attributable outside advances and a completed other-return credit of zero are a sufficient supported cohort; this is not a universal legal prerequisite or a claim that a positive credit on another return necessarily disallows the payer's deduction.

The new optional child relationship attachment records the actual source year/reference, confirmation, owner and original covered-person identifiers, statutory relationship kind, and actual start date. For each positive eligible outside-child payment, this method requires that the relationship already existed at both the actual payment and the start of that covered month. A year-end relationship label, shared-policy agreement or Part V dependent assignment cannot supply the missing premarital fact. Other relationship timing remains a separately identified qualification method, not a legal-ineligibility finding. The actual monthly coverage-family evidence remains mandatory.

Only the eligible actual cash is added once to nonspecified premiums. The existing Pub 974/8962 calculations, allocation percentages, business limits, final repayment and form rounding are unchanged. The source field cannot set a deduction, credit, repayment or alternative family size. Own-family positive advances can still be present on another original or month where the existing method determines their treatment; they are not attributed to the outside child.

## Derived independent control

This is a derived test, not a published numerical example. January–June has an original premium of 3,000.03 per month, an actual allocated family premium of 1,000.01, owner family cash of 1,000.01, owner child cash of 100, other payer cash of 1,900.02, and zero advances. July–December has a distinct own-family original of 1,000 with 1,000 advances and no child cash. The separate completed child return has zero credit. The actual relationship already existed before all payments. Both alternative marriage families remain one person.

Python Decimal arithmetic prepared before the implementation gives specified premiums of 12,000.06 and nonspecified cash of 600. Business income of 100,000 less the reported SE-tax half of 7,065 leaves 92,935. The maximum deduction of 12,600.06 gives Step 2 income of 80,334.94, reported as 80,335. Joint monthly contribution is 558 and alternative contribution is 155; seven alternative months plus five fully married months yield credit 5,725. The exact combined deduction is 12,000.06 − 5,725 + 600 = 6,875.06, reported as 6,875. Final AGI is 86,060, joint contribution 610, alternative contribution 194, credit 5,192 and repayment 808 against actual own-family advances of 6,000.

The existing specified-only audit records 6,275.06; the final Schedule 1 and QBI deduction use reported 6,875. Two initial author expectations confused these audit/rounding boundaries. Those failures remain retained; no QBI or rounding implementation was changed. Additional tests preserve exact 600.06 child cash, actual employer-month exclusion, age 27/zero-payment boundaries, complete source reordering, and exchanging actual primary/spouse positions with all original owner bindings.

## Guide and review output

The existing health panel offers an empty relationship record with no inferred owner, identity, kind, date or confirmation. Source edits invalidate its nested confirmation and the existing plan, health, allocation, marriage and household confirmations. A root confirmation cannot repair an unknown nested date. The full shell and private workspace exercise reconfirmation against the original records.

The Form 7206 appendix prints the actual child relationship kind, start date, year, owner and source reference separately from the other-return credit source and the marriage family. Personal owner/child identifiers are withheld. Existing prepared-output binding includes the complete new source record before any output I/O. An identifier-only tampering test initially redacted its change before validation; the corrected test uses the actual changed input for that case. Other source changes continue to use the prepared redacted path. The original failure is retained; no context validation was weakened.

## Development evidence at source freeze

All evidence lives in `.local/upgrade-evidence/` in the main checkout, with exact commands and hashes in `marriage-outside-health-initial-checks.json` and `marriage-outside-health-development-checks.json`.

- `marriage-outside-health-core-red.log`: four initial failures; three substantive supported cases reached the old blanket rejection, while the fourth was a mismatched error-text expectation. Do not count that fourth case as a separate product defect.
- `marriage-outside-health-core-green1.log`: three passed, one incorrect author audit expectation failed.
- `marriage-outside-health-followthrough-red.log`: five failures/three passes, preserving absent source adapter/controls/review output and the second corrected author audit expectation.
- `marriage-outside-health-followthrough-green1.log`: seven passed, one identifier-test redaction mistake failed; test-only correction described above.
- `marriage-outside-health-focused2.log`: nine tests/five files passed with one worker.
- `marriage-outside-health-affected.log`: 62 tests/23 files passed with one worker, 36.59 seconds, including ordinary outside-person, monthly-marriage and shared-marriage consumers.
- Root and web type checks passed. Strict spec references passed 5,971/5,971.
- Scoped lint passed with zero errors and 133 warnings, recorded explicitly; these include new test non-null assertions and retained affected-file warnings.
- `git diff --check` and the production web build passed. Build tracing warnings from the external shared node_modules layout are retained in the log.

Checks use the shared pinned Node 24.22.1 dependencies and the independently reviewed pako 1.0.11 patch: patch SHA256 `d41a50bfb404925c968ae99ca11a824bf057a67692637c9ecb44bdd99eb90e04`, installed deflate SHA256 `f537b12f55f31f9af74b162d0ad6b3667c78c356875f18c9f56be4db419d6ccc`. No package version, threshold, test deadline, source assertion or release gate was changed.

Production desktop/mobile cases and retained original-input/PDF artifacts are still pending at this source freeze. The source review, independent original/PDF review, final main rebase and release evidence remain separate. No main tracked path, metadata, inventory, implementation-link file or public branch was changed by this private package.

## Finite boundaries

Completed other-return zero and zero outside advances remain the current supported source cohort. Positive other-return credit or positive outside advances need their precise payment/credit attribution method; this is not a blanket outside-child prohibition. Actual relationship timing not already established for the payment and covered period remains unresolved under this method. Other eligible outside-dependent qualifications and positive noncoverage attribution remain separately visible. Ambiguous 2025 joint capped-repayment allocation between owners is not settled by a downstream QBI ratio or a shared-policy agreement. These boundaries do not claim all health methods or 2026 filing readiness complete.

## Independent review and final integration

The original frozen tree is `69a182ae4e1e2e37fd4a2a2dfce0e21475893e2f`.
Production desktop/mobile source entry, confirmation, persistence and reload
pass 2/2 with one worker and zero retries. These cases did not download PDFs;
the artifact producer replayed the actual saved guide/workspace through the
ordinary workspace output path.

Independent parent source review passes 16 tests in six files, including seven
private controls derived from official instructions. These cover different
cash amounts, relationship dates, invalid source identity and policy coverage,
confirmation revocation and equal-money stale-output rejection. The original
source and all 3,650 tracked hashes stayed unchanged. Source report SHA256:
`de6c947445f047e7275b9cd43e3c13d018520a5d719f14336c8116e80d568e83`.

Independent saved-output review derives expected money from six original
records using Python Decimal and refreshed IRS sources. Calculated result
records were hash-checked only, never used as the oracle. All 14 PDFs, 156 pages,
456 populated value fields and 24 unchecked controls pass 11,029 comparisons.
All pages were rendered; six contact sheets, thirteen readable details and two
actual browser screenshots were personally inspected. Blank original SLCSP
versus canonical null was the sole reader correction; all 36 initial reader
mismatches and the original script remain retained. No monetary expected value,
source input or implementation changed. Report SHA256:
`f67a874becad41115f52e5e0f6f3c0ab2ab37c1d338c0f8e01867758b8541fe2`.

The final integration starts at `00089be4`. The sole runtime three-way merge is
the optional child relationship schema in `src/models/inputs.ts`; the current
charitable and educator schemas remain unchanged. Other runtime and test paths
are identical to reviewed source. Rule provenance advances to `2025.179` /
`2026.176-law-integration-draft`, with an explicit shared-method inventory link.
Final immutable source checks and production browser verification are recorded
separately after this freeze. Agent reviews do not replace qualified human tax
review, final 2026 forms, staging evidence or filing gates.

## Final integrated verification

Immutable final tree `f5b848b4bcf12a99be70d80c7e3e88d2c526a65a` passes 21 tests/nine files, including all seven
unchanged private controls. Root, web and contract types, all 6,009 spec
references, inventory and scoped lint pass; lint retains 133 warnings and zero
errors. All 3,682 tracked source hashes remain unchanged. Final check receipt
SHA256 `9257a6f77db8adde6b24af3cd821037902428014c312efdee6bb42ffdd0922d6`.
Both builds pass, followed by production desktop/mobile 2/2 with one worker and
zero retries (10.3 seconds test duration). Local port3463 is closed. Production
receipt SHA256 `420b76047125a22da1a192066663376ea29970ecf9e72cd72f1293ba95e55d4b`; browser log SHA256
`795eec9d195886bec09ad0a48f0035bd316e9cc9ffba78ea68cf2a4877255846`.

The final actual guide records exactly match both original browser records;
workspace tax year remains 2025. Comparison receipt SHA256
`2d47ca8082cc15b7978e0ff8abe141872368344762b45be9666d342859915a1e`.
This comparison does not claim new browser PDF downloads or pixel equivalence.
Adoption verified all twenty owned paths, the unchanged main predecessor and
all 3,682 final source hashes. Main focused tests across eight files, root types,
spec, inventory and diff checks pass. Main receipt SHA256 `cde75af0aa21b7148e044d378c02105f56788561545a6d181043d8baafcd0d0f`;
affected log SHA256 `8cdb5363c6c38a7a1daa61a43a8c0252f41c74687ffa3465057a6fcaacd4ea1b`.
Only this evidence append changes after the final executable freeze. No final
2026 form, qualified human review, filing or release gate is promoted.
