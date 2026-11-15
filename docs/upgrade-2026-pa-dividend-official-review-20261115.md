# Original-bound Pennsylvania dividend review paper

The existing complete-source 2025 single-taxpayer resident packet now carries the
official PA Schedule B review copy when its existing attachment trigger applies.
Other ordinary cohorts and legacy methods retain their reference summaries. No
tax calculation, ownership allocation or filing qualification is added. The
2026 form and filing gates remain closed; packet completeness remains partial.

The [official 2025 form and instructions](https://www.pa.gov/content/dam/copapwp-pagov/en/revenue/documents/formsandpublications/formsforindividuals/pit/documents/2025/2025_pa-40b.pdf)
were fetched independently on November 15. Its exact five-page revision is pinned
as `c6d8f5cdd63045e1e40b6deeced2c80b23006b7700befe3b8f0c430f2b40a0d4`.
The existing trigger is an amount on lines2–11 excluding subtotal6. The physical
cohort here uses primary-owned ordinary dividends and capital distributions,
with no reduction/addition adjustments; it does not claim all form scenarios.

Fourteen numeric slots, including9a/9b/9c, use original-derived canonical Decimal
values and the existing whole-dollar rounding. The fixture2000/500 prints2500;
2000.49/500.50 prints2000/501/2501. Original preparation retains the existing
canonical federal Line3b scalar once. Both rendering and readiness compare its
exact cents with the incoming result, and preparation reconciles its rounded
value with ScheduleBLine1. No tax calculation is replayed by the readiness label.
The opaque context also binds complete original/redacted input digests and the
entire expected Pennsylvania result. Forged, stale, missing and part-year
contexts cannot certify an official-paper label merely from its filename.

Independent review reproduced two real gaps in the first candidate: filename-only
readiness wrongly certified an unsupported part-year paper, and altered federal
Line3b could disagree with printed ScheduleBLine1. Both actual failures and the
pre-fix renderer artifact are retained. Their independent regressions now pass.
The aggregate's old reference-file expectation and its linked spec title were
updated only after their actual failures; unchanged2379tax, original facts,
partial/filing-false disclosure and privacy assertions remain. The aggregate
now additionally asserts no input mutation and zero saved fields/widgets.

## Verification

Author checks pass1044 tests in ten files, root/web types, scoped lint and all34
B/adjacent strict spec references. Independent review verifies14 frozen source
files and baseline Git blobs twice, passes22 separate controls and37 replayed
tests, and independently matches the official blank bytes. Root passes118 focused
tests in eight files and the coverage-inventory check, and reviews the complete
14-file change before adoption. Full integrated checks and runtime successors
follow the committed source; these focused passes do not substitute for them.

Root strict-reader/PDFium inspection covers all five interactive and five
flattened pages. Both page1 rasters and the five-page flattened contact sheet
are visually inspected: all fourteen values are legible, the primary oval alone
is selected, name is redacted, SSN blank, and every page bears its review notice.
The flattened artifact has zero fields and widgets. Static official links remain.
Interactive and flattened rasters have rendering differences; pixel identity is
not claimed. The optional pypdf CFF/fontTools warning is retained, with actual
PDFium rendering and canonical/widget checks used for physical verification.

| Evidence | SHA-256 |
| --- | --- |
| Author14-file freeze | `520be1d37d4c487f0703ca9a6826759200abf3fbee9477f1a88339040c8c56eb` |
| Author receipt | `0664666089b2cabee1b3dd1e661dd8956c2e94ca76af94672ff7220af040b2d1` |
| Independent final review | `d10d7f08ca52797f0995a0811c37723afef8e5da7f58aa7f3b2fe7c2e9226657` |
| Root final review | `d59ff5f9499bcafacede0b6bfeb1c96699e61afb56fa713be4e7788790b1eda4` |

Private evidence roots are `nov15-pa-schedule-b-physical-review`,
`nov15-pa-schedule-b-native-final-review` and
`nov15-pa-schedule-b-root-physical-review` under `.local/upgrade-evidence/`.
Qualified human review, broader scenario qualification, final2026 annual forms,
filing and all other execution-brief completion criteria remain separate gates.
