# 2026 Schedule 8812 physical candidate

The [IRS final forms index](https://www.irs.gov/forms-instructions-and-publications?find=schedule+8812) lists the English 2026 Schedule 8812 as posted November 9, 2026. The [final PDF](https://www.irs.gov/pub/irs-pdf/f1040s8.pdf) was retrieved November 13 at 01:11:08 UTC, November 12 Eastern. It is 96,696 bytes with SHA-256 `05b96bd809b37cfd0c223ac0909d2d82645eb8bfd6244701189f40ab8a4ab45c`. The printed revision is Created 8/18/26. The creation and modification metadata are dated November 9. Both pages are US Letter.

The [2025 Schedule 8812](https://www.irs.gov/pub/irs-prior/f1040s8--2025.pdf) and 2026 publication have the same 41 leaf names, but several widget rectangles changed. The candidate binds the exact annual locations for 35 text fields and six checkboxes, including the nested line 6 count, the separate line 16b count and amount, and the read-only reserved line 15. The table records the material printed transfer-reference changes.

| Schedule 8812 line | 2025 | 2026 |
| --- | --- | --- |
| 1 | Form 1040, 1040-SR or 1040-NR line 11a | Form 1040, 1040-SR or 1040-NR line 11b |
| 22 | Schedule 1 line 15 and Schedule 2 lines 5, 6 and 13 | Schedule 1 line 15 and Schedule 2 lines 16c and 17c |

The printed $2,200 child credit maximum, $500 other-dependent amount and $1,700 refundable cap per child are unchanged on the forms. [Rev. Proc. 2025-32 § 2.05](https://www.irs.gov/pub/irs-drop/rp-25-32.pdf) corroborates the 2026 child credit maximum and refundable cap. The [final instructions endpoint](https://www.irs.gov/pub/irs-pdf/i1040s8.pdf) still serves 2025, and the [2026 instructions](https://www.irs.gov/pub/irs-dft/i1040s8--dft.pdf) are marked draft. The revised printed references remain source observations. Calculation and production routing require the final companion forms and worksheets, source reconciliation and qualified review.

The spec and test preceded the expected missing-final-asset assertion failure. The five new checks and all 53 combined candidate and historical Schedule 8812 PDF tests passed on the pinned Node 26.13.1. Scoped lint, engine types and all five spec references passed. An initial Node 26.13.0 pass reported the expected package engine warning after the runtime pin changed, and the exact supported replay is retained separately.

The unchanged blank has XFA and JavaScript metadata. It stays outside the public template registry. Both fictional diagnostic copies kept the original 41 widgets and text/checkbox appearances with line 15 blank and `REDACTED` in the SSN field. Reopening inspected all referenced and xref objects for active PDF actions and verified the AcroForm had no reachable XFA. Both copies rendered on all four pages with their review notices visible. These finite checks cover fictional physical placement, with public 2026 review and filing still disabled. Private evidence is under `.local/upgrade-evidence/nov12-schedule-8812-final-physical`.
