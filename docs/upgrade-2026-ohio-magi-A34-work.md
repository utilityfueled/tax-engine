# Ohio 2026 MAGI: required actual A34 deduction

The isolated statutory baseline now adds the actual completed qualifying
capital-gains/payroll deduction to Ohio MAGI, alongside the business-income
deduction. R.C.5747.01(II) requires both addbacks. The additional amount affects
exemption/joint-credit limits; it does not change Ohio AGI or deduct the amount
a second time. Missing, malformed, number, nonfinite and negative amounts reject;
known zero is explicit. All monetary arithmetic uses Decimal.

The spec precedes four new existing-API tests, all failing before implementation.
After the repair, 73 tests in four files pass. All prior numeric and historical
registry assertions remain; three finite fixtures explicitly supply known zero.
Product typecheck, scoped ESLint with zero warnings, Ohio specs and diff checks
pass. The generated inventory is rechecked without opening readiness status.
Final integrated checks remain pending the other active packages.

Distinct engineering review passes 31 actual-candidate controls: combined A28/A34
at the 40,000, 80,000 and 500,000 boundaries on both cent sides, joint-credit
ceiling, unchanged tax base, audit, unknown/exactness validation, Decimal input
and closed year gates. These are independently derived synthetic arithmetic
checks, not a CPA/EA/tax attorney review.

Official sources refreshed November 5 UTC:

- [R.C.5747.01](https://codes.ohio.gov/ohio-revised-code/section-5747.01), (II) and (A)(34)–(35), SB9 effective March 5, 2026. A35 is not listed in the MAGI addback.
- [R.C.5747.025](https://codes.ohio.gov/ohio-revised-code/section-5747.025) and [5747.05](https://codes.ohio.gov/ohio-revised-code/section-5747.05), exclusive 500,000 exemption/joint limits.
- [R.C.5701.11](https://codes.ohio.gov/ohio-revised-code/section-5701.11), current conformity reference date; this metadata refresh does not establish complete conformity.

Immutable provenance advances to `oh-2026.2-baseline-draft`. This helper still
takes completed amounts and does not qualify the underlying A34 deduction,
actual-source eligibility or a full Ohio return. Full-year, part-year and
nonresident integration, other state branches, qualified human review and final
2026 forms remain required. Public year and filing gates stay closed.

Private author evidence: `nov05-ohio-magi-A34-implementation`, manifest
cb629e9bfa5d2f7f21f704e511ce8aa3e12df64846aca851ecbdb251940c238c.
Distinct review: `nov05-ohio-magi-A34-independent`, manifest
afc2531b762fa202b7fa71ad94ef5903dcbfae46a5967730eb4ba093af7f57d8.
