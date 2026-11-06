# Current Form 8862 actual EIC records

This package continues the actual denial-history method. It does not replace an IRS determination, treat a completed checkbox as entitlement, or change public filing/year/human-review gates.

## Sources and supported method

Official final [December 2025 Form 8862](https://www.irs.gov/pub/irs-pdf/f8862.pdf), [instructions](https://www.irs.gov/instructions/i8862), and [2025 Publication 596](https://www.irs.gov/publications/p596) were refreshed on 2026-10-26. Parts I and II are implemented for EIC only. Parts III and IV concern other credits and are not inferred from the EIC packet. The current claim year, line 3 income-only answer and need for this form are derived from actual denial/allowance history.

The new optional `eic.recertificationSources` retains original filer and dependent identities, current-year source references and confirmations, complete candidate children, actual day ledgers, known-empty temporary absences, military orders, and actual child birth/death evidence. No missing amount, child list, day count, period or affirmative answer defaults to zero/true. General child validation is shared with the existing Rule 3 source helper. Repeated current/Rule 3 child facts and direct calculation/history/claimant contexts must agree.

Source days stay distinct from printed line 7. A child born or deceased in the claim year who lived in the claimant's home for more than half of the alive period prints 365/366 under the express instruction. The actual days remain retained. Pub596's born-and-deceased SSN exception requires an actual available birth/death certificate or hospital live-birth record; the review path must identify that external attachment requirement, never invent or generate such evidence. An actual child without a valid SSN otherwise preserves the self-only amount route without applying childless age rules.

Ordinary full-year claimant days, actual temporary absences and source-confirmed extended-duty days are supported. Deceased-claimant short-year day allocation, other special child residence periods, contested priority and married-child dependency methods remain explicit limitations. The line 10 citations include the published death-age examples already implemented in claimant eligibility; this new cohort does not claim a numeric short-year day oracle or enable that method.

## Development evidence

Spec preceded the source and canonical regressions. The initial missing-module red, two source-boundary reds and four canonical reds are retained separately in the private evidence directory. Fourteen source/canonical cases now pass, including literal 649 self-only and 3409 one-child controls from the already independently checked final2025 table, original-source mismatch/zero-credit controls and no mutation. The first shared-child extraction passed 206 adjacent cases in 16 files and root types. Final core checks passed 682 tests in 18 files (including 470 strict spec-reference cases), root types, and scoped lint with zero errors/four existing federal warnings. Evidence logs are `form8862-core-adjacent-final.log`, `form8862-core-types-final.log`, and `form8862-core-lint-final.log` in the private verification directory.

## Remaining delivery

The actual guided controls, semantic confirmation invalidation, desktop/mobile persistence/privacy evidence, final physical Form 8862 mapping, original-source private review context and saved/reopened rendered review evidence are separate ongoing work. This core freeze alone is not a complete user-facing route and does not qualify a filing year or release.
