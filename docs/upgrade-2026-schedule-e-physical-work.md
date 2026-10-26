# Schedule E physical review correction

The previous final2025 mapper put net rental income/loss in line23a–c, omitted
royalty property columns, placed Part II totals in unrelated/shaded cells, and
wrote supplemental income into line42 rather than41. It also dropped properties
after the third and K1 rows after the fourth, and used preliminary rental and
passive losses. These errors were reproduced before the correction.

The [final2025 form](https://www.irs.gov/pub/irs-pdf/f1040se.pdf) and
[Schedule E instructions](https://www.irs.gov/instructions/i1040se) were refreshed
October26. The locally registered final PDF was inspected with pypdf widget
coordinates and rendered against its printed line/column labels. The web
screenshot endpoint was unavailable; the local renderer provided actual pixels.
No draft or future-year form was substituted.

`spec/federal/schedule-e-physical-review.yaml` preceded the five failing physical
controls in `schedule-e-physical-red.log`. The implementation now preserves
actual royalty categories, gross/expense/net distinctions, source-indexed allowed
rental and K1 losses including prior losses beside positive current income,
correct printed subtotals and final Schedule1line5. Per-property depreciation and
amortization use completed ScheduleE audit values. Actual known rental days are
rendered without a new fallback. Additional property/K1 columns are retained on
flattened continuation pages with their ranges identified; totals appear once.
Printed loss cells that already have parentheses contain positive magnitudes.

A second red test (`schedule-e-physical-179-red.log`) reproduced a fully absorbed
nonpassive179 amount missing from its separate expense column. That positive-net,
nonbinding case now prints ordinary income and the deduction separately. Other
passive/binding179 character allocations remain an explicit review limitation.
Original royalty amounts without actual property attachment are retained in
aggregate and disclosed in a separate source note; the map does not invent a
property partition or confirm absent expenses. Other unmatched supplemental
source adjustments are disclosed by exact amount instead of a guessed physical
row. Those limitations are ongoing methods, not qualification evidence.

An opaque request-local context recomputes actual royalty input before render
redaction. Stale source/owner/income/receipt or retained calculation changes and
forged contexts reject before template/output access. The original sources never
appear in the context token. Full packets retain an actual zero-net property.
No privacy, filing or2026 readiness gate changes.

The first corrected cohort passes35tests/2files. The enlarged cohort passes75tests
in eight files, root/web types and5,228spec references on the private development
base. pypdf confirms fourth-property/fifth-K1 continuation amounts, repeated
review notices and identifier omission. The initial type/indent diagnostics are
retained; subsequent types and spec validation are clear. Existing wrong
expectations are replaced by literal printed-form controls, not removed.

The immutable reviewed tree is `cf4f3c8b8356e63387f18d7d48dc2695be78bbff`
on `bc5c837`. Its package and adjacent checks pass86tests/10files; another24
workspace and royalty-panel cases pass. Root/web types,5,243spec references and
scoped lint pass with zero errors and27 warnings. A separate agent verified all
eight frozen blobs and passed44cases/3files, including five private controls for
source indexes, prior losses, loss magnitudes, actual ownership/day allocation
and retained-result/context tampering. The review log SHA256 is
`a64229d60ffaeb28602cd3740bd17bb24a2f908496d985fe36a91fa433bf02c0`.

Eight saved PDFs contain19pages. The separate reviewer verified every artifact
hash,23literal physical fields, every review notice and personal/account identifier
omission, then rendered and inspected all19pages and footers. Explicit business
EINs remain visible under the existing documented review-redaction policy. This
is not general free-text anonymization. Initial reviewer assumptions about
Form8582 proration and an unsupported loss source were corrected only in private
probes, with the original logs preserved. No product correction was needed.

This is a review-only form correction, not final2026 form availability, filing
qualification or independent human tax review. The final main integration is
checked against all seven reviewed non-ledger blobs before commit. The final
integration passes63tests/4files, root/web types and5,248spec references. Parent
also reopened all eight saved artifacts and inspected all19rendered pages. An
initial parent privacy probe incorrectly classified intentionally retained business
EINs as personal identifiers; the probe was corrected to the existing documented
policy, without changing any artifact or redaction behavior.
