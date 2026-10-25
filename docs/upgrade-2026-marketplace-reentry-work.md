# Marketplace renewed eligibility

Status: bounded source method implemented and independently reviewed by an agent.
Full 2026 calculation and filing qualification stay closed; this is software and
source review, not independent human tax qualification.

Sources refreshed October25,2026:

- [RevProc2014-41](https://www.irs.gov/irb/2014-33_IRB), sections3 and5.02–5.03,
  permits an alternative initial-credit/final-deduction/final-credit calculation.
- [Publication974](https://www.irs.gov/publications/p974), the opening caution
  under Self-Employed Health Insurance Deduction, permits a computation satisfying
  both laws and the premium conservation rule. Simplified Step2 requires ordinary
  refiguring when the final ordered iteration is ineligible.
- [Section36B](https://uscode.house.gov/us/usc/119-118/t26/s36B/), subsection(f)(2)
  and the section71305 effective-date note, requires full excess advance repayment
  after2025. This package does not apply the old repayment ceiling to2026.

The ordinary refiguring pass can restore eligibility after the ordered simplified
pass denied it. Previously this exact case rejected. The alternative method uses
the actual ordinary maximum as its initial health deduction, recomputes every
enabled AGI-sensitive claim and actual initial credit, subtracts the attributable
credit from source premiums subject to verified earned-income limits, then
recomputes the final return. The final pass retains no interim ordered IRA,
bond, rental or student-loan worksheet, no auxiliary400 percentage, and no interim
NOL claim or carry. A supplied final MAGI must reconcile to the completed result.

The new method is named `pub974-alternative-reentry-2026` in results and separate
audits. Existing original policy, payment, owner, employer eligibility and business
source checks remain mandatory. No new user-entered calculation amount or method
override is introduced. Existing actual guided sources already reach this path.
Current2025 review pages remain unchanged; this package does not export2026 forms.

Derived numerical control, not a published IRS oracle:106000 business profit
less7489 half-SE gives98511. Ordinary health12000 permits IRA3370 and initial
household income83141. Initial credit is12000-round(83141×.0996)=3719. Alternative
health8281 gives fresh IRA MAGI90230 and deduction580, then finalAGI89650,
PTC0 and full6000 advance repayment. This is a permitted conservative method,
not a promise of an optimal deduction/credit pair. The separately ineligible
110000-profit control retains ordinary12000 health, IRA580 and AGI89648.

With107076 profit, half-SE7565 and an actual fully usable1000 regular NOL,
the same98511 starting income and final89650 result hold. Only final regular
deduction/absorption1000 and carry0 are retained; actual known-empty independent
AMT history stays empty. Source objects remain unchanged.

The initial bounded method requires its ordinary deduction to equal the verified
combined maximum. Different binding per-business limits, historical forgiven
advances, shared-policy/partial-family allocations, two-owner coordination and
alternative marriage remain specific internal methods. New source work is not
declared complete merely because its branch rejects.

Verification: the two new return cases first failed at the existing re-entry
and premature final-MAGI guards. The exact executable, spec, and test snapshot
`53c59722b1a81305137ae414f0ecfadc2b8ea493` passes 249 tests across 30
Marketplace, 7206, 8962, NOL, charity, guided, PDF, readiness, and strict-spec
suites. Root and web types pass; all 4,775 spec references resolve. Scoped lint
has zero errors and four existing federal non-null warnings. The snapshot excludes
concurrent adoption review work and parent documentation changes.

The parent independently refreshed Rev. Proc. 2014-41 and Publication 974 and
passed 13 tests across four files, including three additional source controls.
Zero advances and premiums fully funded by 12,000 of advances retain health 8,281,
AGI 89,650 and final PTC zero; actual repayment is zero or 12,000 respectively.
Unconfirmed coverage rejects. The first review run's message-only assertion was
corrected to the existing earlier guard; product code did not change. No
additional actionable finding remained in the bounded review.

Evidence: `.local/upgrade-evidence/marketplace-reentry-{red,green,boundary,nol}.log`,
`marketplace-reentry-exact-{tests,types,lint}.log`, and
`parent-marketplace-reentry-{review,rereview}.log`. Rule versions 2025.82 and
2026.78 retain the existing review and filing statuses.

The next owned package is ordinary two-family shared-policy allocation with
actual original policy records and agreed monthly percentages, followed by its
source intake and review output. Two-owner health coordination, year-of-marriage
calculation, different binding business limits and the other explicitly named
methods above remain unfinished implementation, not external approval blockers.
