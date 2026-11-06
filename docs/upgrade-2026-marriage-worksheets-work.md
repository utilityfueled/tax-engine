# Marriage-year alternative calculation prerequisite

This package implements the completed arithmetic in Publication 974 Worksheets I-V and the corresponding Form 8962 monthly reconciliation. It extracts the existing contribution table into a shared pure calculator so ordinary and marriage worksheets use the same year, poverty region, percentage and rounding rules. It does not enable a marriage election on a return. Actual marriage, family, policy and eligibility source binding, canonical routing, guided intake and Part V output are the next package.

The calculation preserves original cents, aggregates within each source group before rounding, and retains the separately computed owner assistance amounts. It requires both alternative family sizes, actual monthly amounts and explicit coverage eligibility. It never accepts an entered credit, current income override or repayment amount.

## Official sources and bounded interpretation

Refreshed October 25, 2026:

- [Publication 974](https://www.irs.gov/publications/p974), alternative calculation steps and Worksheets I-V.
- [Form 8962 instructions](https://www.irs.gov/instructions/i8962), Table 4, Parts II/V and repayment limits.
- [26 CFR 1.36B-4(b)](https://www.ecfr.gov/current/title-26/section-1.36B-4), alternative marriage-year reconciliation, including paragraph (b)(5), Example 4.
- [Publication 974 for 2020](https://www.irs.gov/pub/irs-prior/p974--2020.pdf), Worksheets I/III line 4's individual 401-percent stop. This supports the restored 2026 income limit; no historical rate or poverty amount is imported.
- [Revenue Procedure 2025-25](https://www.irs.gov/irb/2025-32_IRB), 2026 applicable percentages.

The final 2025 example for Paulette and Quentin has a printed annual-contribution typo: $117,000 × .0788 = $9,219.60, rounded to $9,220, which agrees with its monthly $768 and downstream amounts. The earlier reference to $9,604 does not. The regression uses the printed aggregate premiums, benchmark amounts and advances. Its individual $500/$433 and $1,000/$833 source split is a compatible constructed fixture, not a published 2025 individual-source fact.

The 2026 result applies the enacted individual and joint income limits independently. The regulation's Example 4 permits premarriage relief when the joint return exceeds the ordinary income limit. The election can reduce repayment but cannot create an additional refundable credit. Current 2026 final forms and full-return qualification remain separate gates.

One derived comparison is explicit: the optional election must also improve the complete annual credit. Worksheet V can omit a month belonging only to an owner who stops at 401 percent. Comparing only its surviving rows could otherwise select a result that increases annual repayment. A literal 2026 regression retains $454 ordinary credit and $1,546 repayment instead of electing $34 credit and $1,966 repayment. This is selection of the beneficial optional method, not an added IRS worksheet line or a published numerical oracle.

## Verification

The initial seven tests failed because the new module did not exist. They passed after implementation. The additional full-year comparison test then failed with an incorrect election and passed after the comparison correction. Logs are retained under `.local/upgrade-evidence/marriage-worksheets-*.log`.

The bounded cohort passes 159 tests in 14 files, including ordinary 2025/2026 Form 8962, shared policies, Marketplace ordered deductions, passive losses, NOLs, re-entry, existing PDF mapping and strict spec structure. The immutable review tree `38d5c2b50d273cde0a7ca7e767b94ce5ce4b6375` also passes root/web types, all 4,886 spec references and scoped lint with zero errors or warnings. No runtime readiness gate was changed.

An independent agent refreshed the official sources and verified all six frozen blobs. Its existing/package run passed 100 tests in five files; its package and three additional probes passed 36 tests in five files (overlapping the first cohort). The additional controls independently verify separate-family minimums, the individual 2026 400-percent boundary, independent group rounding, immutability and explicit unknown-source rejection. Evidence is retained in `ai-marriage-worksheets-review.log`, `ai-marriage-worksheets-probes.log` and the adjacent review summary. No actionable finding remained. This source/software review does not substitute for qualified human tax/form review.

Below-poverty joint eligibility, third-party allocations combined with marriage, QSEHRA and self-employed health coordination remain separate methods. Actual source binding and canonical election routing are the next internal implementation; this prerequisite alone does not establish a usable marriage-year return path.

The final rebase onto `c89c81c063b9ea74fc8fa7c9f793d82a9d1b86d8` produced verification tree `f8a5f3dff220b7b907466dc69773811b909c4fe0`. All five executable/spec/test blobs match the independently reviewed tree. It passes the same 159 tests, root/web types, all 4,891 spec references and scoped lint with zero errors or warnings. Only this final evidence paragraph was added after those checks; no executable source changed.
