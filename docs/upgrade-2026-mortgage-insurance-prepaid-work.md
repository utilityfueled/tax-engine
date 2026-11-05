# Actual prepaid mortgage-insurance allocation

The finite 2026 method now derives an annual allocation from actual current
original FHA/private premiums. It binds the policy/payment originals to the
same complete canonical mortgage worksheet and Form 1098 by year, source IDs,
lender, account, owner and closing dates. It requires actual premium, stated
term, insurance-obtained/payment/contract dates and complete qualifying facts.
Unknowns reject even when the premium is zero. Box 5 never supplies a guessed
prepaid amount.

The pure Decimal calculation allocates the actual premium across the shorter
stated term or 84 months, beginning with the insurance-obtained month. It does
not round monthly quotients or individual loan allocations. Schedule A sums
exact allocations, applies the existing AGI phaseout and rounds once. Literal
examples produce 880, 3,080, 110, 0.50 rounded to 1, and phased-down 792. Two
independent half-dollar loan allocations aggregate to 1, not 2. The existing
manual route remains available; if an annual amount accompanies originals,
it must reconcile exactly and is never added again.

This source route is deliberately limited to a current original mortgage,
primary payer, outstanding through year end and unmixed qualifying residence
use. Refinance, payoff, cancellation, refunds, prior premiums, other payers,
VA/RHS and mixed use require their separate methods. An actual zero last
balance contradicts this outstanding cohort; an actual annual highest balance
cannot be below current original/acquired Form 1098 principal. Independent V1
review retained both accepted-invalid 880 results; spec-first V2 regressions
now reject them. Average balances are not reinterpreted as year-end balances,
and a term equal to counted calendar months is not guessed to prove payoff.

Authority is [26 CFR 1.163-11](https://www.ecfr.gov/current/title-26/section-1.163-11),
[26 USC 163](https://uscode.house.gov/us/usc/119-120/t26/s163/) and section 70108's
post-2025 effective date, with retained official Form 1098 instructions and
Publication 936 balance definitions. Historical 2021 Ryan arithmetic is
corroboration only. No final 2026 form or professional interpretation approval
is inferred from that example or these engineering checks.

The six-path candidate passes 218 tests across six files, including 74 new
source cases and 144 existing Schedule A/mortgage/guided-history controls.
Distinct source/API review passes 263 tests across nine files and scoped types.
Root current-main replay passes the same 218 focused tests and another 881
inventory/spec controls. Three typechecks, spec/inventory validation, both builds
and normal repository lint pass (zero errors, 11,863 warnings), with no drift in
4,657 pinned sources. Initial stale inventory failure is retained before normal
regeneration: 890 entries, all 889 prior entries unchanged and 68 supported
unchanged. The new entry is explicitly partial/2026 with the official authority.

Frozen manifests: V2 author
`ca628d433ae05f96c61b69fc136e213a7ac848f08184eb9093d8c33cbeaed4df`;
distinct V2
`40bb200e516b4a94ac86ca83e3fba20be13cecd3fe0df7b6bf7fc37d7aff8645`;
current-main integration
`a4dd2e29dfbaf85e66837c70a0c854b48d46485f4dff0b37fd3fb68f771bffb0`;
saved currentness review
`8d9965f80ae72ee0be8615f500e7bc83cdd1f05f71ed2d4376916608776d7f2f`.
That reviewer authored the candidate; independent product review is the separate
native engineering packet above.

Native original intake is a separate active package. Full-year 2026 calculation,
filing, physical exports, human review and hosted/self-hosted qualification
remain gated. These focused checks are not a new full-suite or release pass.
