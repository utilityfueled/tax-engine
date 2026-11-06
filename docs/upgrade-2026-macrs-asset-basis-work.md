# Actual MACRS basis and form reconciliation

The finite first-year asset path now starts with actual gross basis and business
use, subtracts actual business-only section 179, then actual bonus. The mandatory
mid-quarter test uses the amount before bonus. For gross $10,000, 60% business use, $1,000 section 179 and $2,000 bonus this produces $6,000 business basis, $5,000 convention-test basis and $3,000 regular MACRS basis;
five-year half-year depreciation is $600. Listed property does not apply business
use a second time. Explicit asset conventions cannot avoid the aggregate test;
current-year changes cannot change a prior-year asset's convention. Explicit
same-year dispositions produce no depreciation.

The new strict source packet requires original-bound facts, actual full dates,
known zero amounts and confirmed absence of unsupported basis adjustments or
conversion/carryover basis. Its supported cohort is calendar-year first-year
GDS 200% declining balance, classes 3/5/7/10, constant business use and no disposition/history/change;
listed property must exceed 50% and be nonpassenger. Missing packets preserve
legacy compatibility, labeled unqualified. Invalid supplied packets fail before
zero or exclusion shortcuts. References and confirmations do not authenticate
documents or establish qualified human review.

Form 4562 requires complete packets for the whole entered asset collection and
reconciles its actual section 179/bonus allocations to lines 12/14. Positive listed section 179/
bonus awaits its separate Part V method. Known-zero listed deductions override
old scalar totals. Monetary audit inputs show the actual basis reductions and
avoid implying another business allocation; documentary references stay private.
This reconciliation does not establish election eligibility or full-form support.

Sources refreshed November 5, 2026: [Publication 946, chapter 4](https://www.irs.gov/publications/p946),
[Form 4562 instructions, Parts I/II/V](https://www.irs.gov/instructions/i4562)
and [26 CFR 1.168(d)-1(b)(4)](https://www.ecfr.gov/current/title-26/section-1.168(d)-1).
Current final 2026 forms are not claimed.

Spec-first evidence retains initial convention failures, the independent prior-
year convention and business-basis counterexamples, five genuine new-source
failures, the corrected missing-assertion failure, three form-reconciliation
failures and one audit failure. Final affected replay passes 232 tests in 10 files;
12 distinct canonical API controls and scoped product/test TypeScript pass.
Root separately passes 197 tests in 7 files, TypeScript and scoped lint with zero warnings.
Three new test-fixture typing errors were corrected through canonical parsing
and explicit negative-input casts; their original diagnostics remain retained.

Private frozen author V2 manifest:
`50214129714c398866c9445f1ba30e529f84b3692ea555702f156425451e0b8f`.
Distinct final review manifest:
`26ee7a3c3cd535f7c44d5ca4e9175f11736ef97f133a5bcfc1b586e4518a95ae`.
Root verifies all 92 members and reads the full product/spec/test diff and reports.
The author packet remains immutable; the review pins root's form and corrected
fixture successors separately. Initial private broad-run interruption and
sandbox-denied loopback/global-check failures remain recorded as failures.

Full integration, browser and distribution checks continue separately. Broader
asset inventory/activity attribution, elections/bonus eligibility, original
conventions, other methods/classes, passenger limits, later-year remaining basis,
disposal/recapture, native facts, qualified human review and final forms remain
required. No filing/model/readiness gate is changed by this package.
