# Review and filing export work

## Audited credit mappings — 2026-10-25

Refreshed the official final 2025 [Schedule 3](https://www.irs.gov/pub/irs-pdf/f1040s3.pdf)
and [Schedule 8812](https://www.irs.gov/pub/irs-pdf/f1040s8.pdf). Schedule 3 line 7
contains only the other-credit subtotal, separately from line 8; extension
payments appear on line 10. The old mapping repeated the grand total on line 7
and omitted line 10. Both now copy the engine's audited lines.

Schedule 8812 now copies verified dependent counts, MAGI addbacks, actual credit
limits, earned income and payroll alternatives. It no longer recomputes these
from raw dependent flags, W-2 wages, a hardcoded refund cap or tax minus total
credits. Actual Puerto Rico residency controls the printed payroll branch.
Unknown legacy possession-income components stay blank; reserved line 15 stays
blank. Missing, duplicate or nonfinite required audit entries reject the export.

Three new mapping regressions failed before the correction. The final focused
run passed 39 tests, engine types and scoped lint. These checks establish mapping
agreement with audited results, not independent tax-law review or filing
qualification. Evidence: `.local/upgrade-evidence/credit-audit-pdf-{red,green,types}.log`.
Both years remain unavailable for filing; 2026 review mappings remain unavailable.
