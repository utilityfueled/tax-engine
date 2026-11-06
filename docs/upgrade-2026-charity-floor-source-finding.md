# Charitable carry floor: corrected source premise

Recorded 2026-10-28 against `238535fe`; implementation continues from
`f4dc51a7`. This is agent source research and an internal correction assignment,
not human tax qualification or permission to enable 2026 filing.

The earlier premise that selecting the standard deduction necessarily removes
the new floor from charitable carry is incorrect for the already determined
current-contribution methods. Software checks in `6fc4312d` and predecessor
nonitemized-carry packages tested that premise. Preserve those results as
historical evidence, but do not use them as current clearance of this treatment.

[Section 63(e)(1)](https://uscode.house.gov/us/usc/119-124/t26/s63/)
distinguishes an actual itemized deduction from whether a deduction is
allowable. The latter determination disregards the absence of an itemization
election. [Section 170(d)(1)(C)](https://uscode.house.gov/us/usc/119-136/t26/s170/)
adds an attributable floor amount to an existing contribution-year percentage
carry; that provision has no itemization condition. Section 170(p) separately
excludes the floor and carry provisions in calculating the current eligible-cash
deduction. It does not erase an otherwise-established ordinary carry.
[Public Law 119-21, sections 70424–70425](https://www.govinfo.gov/content/pkg/PLAW-119publ21/html/PLAW-119publ21.htm)
contains the amendments and effective date. The correction follows these
provisions together; it is a statutory derivation, not a published combined IRS
example.

With a contribution base of $100,000, a current $40,000 category-C property gift
has $10,000 percentage excess and a $500 attributable floor, producing $10,500
ordinary carry under either deduction selection. Actual selected property
deduction remains zero when standard is chosen. At exactly $30,000 there is no
percentage excess and no floor carry; at $30,000.01 the carry is $500.01. Current
eligible public cash of $70,000 likewise produces $10,500 ordinary carry while
the separate single-filer section 170(p) deduction is $1,000. A cash deduction
cap alone does not create ordinary carry: $5,000 current cash has no percentage
excess in this example.

The correction must cover current category candidates, the final carry selector,
explicit nonitemized wrappers and Schedule A routing, existing proofs that the
floor falls wholly on current donations, and the existing NOL comparison order.
Current selected deduction, allowable use, floor disallowance and outgoing carry
remain separate values. Prior-source identities, FIFO, expiration and actual
media remain unchanged where the floor provably does not reach them.

Two different prior-source questions remain precise guards pending a controlling
method. A floor reaching an existing section 170 vintage needs an established
contribution-year/expiration allocation. A pre-2026 entity donation first
released from basis or at-risk suspension raises a different original-gift-year
versus release-year question under new section 170(d)(1)(C). Selecting standard
does not itself resolve either. Do not reset an original year, restart a carry
clock, invent a split, or automatically add $500 to the old release examples.
Preserve any source-proven harmless case; containment alone is not completion.

The independent assessment pins 24 inspected paths and seven original Decimal
controls. It performed no Node execution and did not claim engine reproduction:
`.local/upgrade-evidence/complete-nonitemized-floor-carry-assessment-20261028.json`,
SHA256 `1994039fbbf72d204aa427e2f43b5b2eaf984c20634372a9248ff805670e175e`;
its source note SHA256 is
`d3c0b2cf0da6b72b5a0c27004cb4cfd4fca14d250735874f4b4747399f786864`.
The separate implementation contract is
`nonitemized-allowable-carry-source-contract.json`, SHA256
`c2e1f76a19713a58bed118d4d8cc55ffcee410846cdd020fba518632aa4f22ab`.

The assessment retrieved current section 170 through October 22, 2026. Parent's
later section 63 retrieval succeeded; its two later section 170 endpoint
attempts failed. Those failed retries do not constitute a new source-body
verification. Publication 505 describes current deductions, while the cited
carryover regulation predates the new floor; neither supplies a contrary
standard-year carry formula. Independent source and original-output review of
the implementation remains due. All year, form, privacy and readiness gates
remain in force.
