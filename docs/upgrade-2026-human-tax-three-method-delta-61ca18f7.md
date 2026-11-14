# Unassigned tax review: three additional source methods

This is a review index for exact application source
`61ca18f73df949f92261e365b471a2c21cf04d29`, not a professional opinion or a
release approval. It supplements the existing human-review assignments; it
does not replace or mark them complete. Reviewer, date and separate 2025/2026
decisions remain unassigned.

| Package | Decision requiring qualified review | Engineering evidence |
| --- | --- | --- |
| `29393f5a` Schedule AI | Confirm the actual signed 28% worksheet sum and section 1250 line 13 are annualized and netted correctly for each period, including negative 28% amounts. Confirm the permitted source cohort and full-year component reconciliation. | Independently derived period taxes 46,779 / 46,879 / 47,035 / 47,239 dollars; 234 independently reviewed regression tests, including physical output and stale-source rejection. [Source ledger](upgrade-2026-schedule-ai-special-gains-20261114.md). |
| `63dccc04` charitable floor | Confirm that fully treated original vintages in an entirely absorbed same-medium category each have zero deduction, keep their original consumption and create no new carry. Partial attribution remains outside the method. | Independent 500-dollar category at floors 500.001 and 499.999; 257 charitable engine tests and 18 separate category/boundary probes. [Source ledger](upgrade-2026-charitable-full-prior-floor-20261114.md). |
| `c00d937d` Chapter 12/13 | Confirm the continuing-individual personal-debt cohort, full title 11 exclusion, original case-history requirement, basis cap and exempt-property treatment. Separate estate and conversion cases remain outside this method. | Independently checked 18,000-dollar exclusion for solvent/insolvent debtors; 3,000-dollar basis reduction; 1,064 focused tests and six actual browsers. [Source ledger](upgrade-2026-cod-chapter12-personal-20261114.md). |

The detached private packet contains all 43 exact Git blobs changed by these
three packages, including specs, source, fixtures, independent tests and ledgers.
It is stored at `.local/upgrade-evidence/nov14-human-tax-three-method-delta/`.
Its `source-index.json` SHA-256 is
`db561019a96e4e3a329ade22948d63561e4da4e1a45f1c8a50422e1b6e11e8d5`.
Each saved byte sequence was compared with the named Git revision; every path,
length and SHA-256 is recorded. No working-tree successor is substituted.

The expected results are engineering examples and are not labelled IRS worked
examples. Actual browser and physical-review success establishes only the
recorded integration behavior. Final annual forms, qualified human tax and
security/privacy reviews, AI case/output qualification and release authorization
remain separate requirements. No filing or model promotion is enabled.
