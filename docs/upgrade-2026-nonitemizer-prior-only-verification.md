# Sole prior cash source: canonical assertion correction

The full `032b329d` unit run retained 27,332 passing tests and one failure:
the canonical nonitemizer test still required a blanket refusal for a sole
fully consumed prior cash balance. Nine preceding static/build checks passed.
Coverage was interrupted after that known failure; no coverage or browser result
is claimed. Its owned process group closed with TERM only, and the synthetic
local PostgreSQL cluster stopped normally.

The spec now distinguishes the exact finite case already implemented by
`047eb40a`: contribution base 10,000, no current gift, and one actual 2025 cash
balance of 5,000. Capacity is 6,000, treated-paid consumption is 5,000, and the
50 floor leaves hypothetical itemized charity of 4,950. Explicit nonitemization
claims zero current section 170(p) and zero prior deduction. No balance survives
and no floor carry is created; taxable income stays 10,000. This follows
[IRC170](https://uscode.house.gov/us/usc/119-136/t26/s170/) and
[Reg1.170A-10(b)(2)](https://www.ecfr.gov/current/title-26/section-1.170A-10),
refreshed November6; it is derived interpretation, not a published numeric
example or qualified human opinion.

Only the obsolete refusal is replaced. Exact selected amounts, original source
identity, consumption, zero carry, audit floor and input immutability are asserted.
The mixed current2,000/prior5,000 refusal and zero-base original balance remain.
No runtime, coverage threshold, year, filing, privacy or readiness gate changes.

Current-main verification passes 15 tests in four files at the original limits,
engine types, all8,665 spec references, inventory generation/check and zero-warning
scoped lint. Two new-test setup failures (wrong public proof field, then wrong
audit value property) are retained; only those test access paths were corrected.
Receipts: `.local/upgrade-evidence/nov06-nonitemizer-prior-only-main`.

Full successor checks and exact distribution rehearsals remain required. The
conditional native grant for032b is not activated by these focused results.

Distinct source/software review independently derives the amounts with Decimal,
refreshes official authority and verifies the final two-path correction and saved
15-pass receipt. ROOT read the full report and rehashed all five members; manifest
`a39a21d650b7fe42a94964a71f621c0715e6e53667e9babe619a9f64c3921d44`
is retained in `nov06-nonitemizer-prior-only-independent`. Human review remains open.
