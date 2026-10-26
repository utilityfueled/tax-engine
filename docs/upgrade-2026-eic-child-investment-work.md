# Child investment income for EIC

The canonical EIC total omitted elected children's exempt interest and ordinary
income transferred through Form 8814. Four credit regressions reproduce both
improperly allowed and improperly denied credits before this correction. Child
qualified dividends and capital gains already reach the parent's corresponding
income categories and are retained exactly once.

[Publication 596 (2025)](https://www.irs.gov/publications/p596), Rule 6,
Worksheet 1 lines 2 and 4 and Worksheet 2, was refreshed on 2026-10-26. Its Alaska
worksheet starts with the calculated child line 12. It can differ from the
separate NIIT/4952 allocation because the preferential transfers were already
rounded. The EIC ratio uses six decimal places and its dollar allocation rounds
to the nearest dollar. A literal mixed-income case produces EIC ordinary income
342 while the separate NIIT amount remains 341. The existing NIIT field is unchanged.

The spec preceded five regressions, including each Worksheet 2 line, cents at
the ceiling, a negative allocation remainder, explicit zero, separate exempt
interest and multiple children. Existing actual election/character/AMT sources
are reused. Audit records contain child indices and amounts rather than identities.
The first red run shows missing traces; a second red run places four incorrect
credit assertions first. All original logs are retained.

After implementation, 22 tests in six files pass, followed by 120 tests in 12
files. Root types, all 5,110 spec references and scoped lint pass; lint reports
zero errors and four existing warnings. Evidence is in
`.local/upgrade-evidence/eic-child-investment-{red,red-credit,green,adjacent,static}.log`.
This work starts on the independently reviewed capital component tree
`80493e9e`. Review and integration references will be added before commit. Other
investment-income character methods and final 2026 qualification remain open.

Independent agent review of frozen `d6815f54` verified all five owned hashes,
refreshed the official worksheet and passed nine tests in two files. Four private
controls cover a .499500 ratio, a signed Alaska/line12 remainder, per-child dollar
rounding with exact exempt-interest cents, ordering/immutability and missing,
conflicting or duplicate sources. Six places is a permitted implementation of
the IRS instruction to retain at least three places; it is not a mandated precision.
No scoped finding remained. Review log
`.local/upgrade-evidence/federal-eic-child-independent-review.log` has SHA256
`6d1805805602a8ef27285636f94695b9e2a1bdc74506ddc86b2e636984d3c673`.
Integration begins at `7287999`; all reviewed helper/spec/test blobs and the
federal delta match, preserving the separate Rule 3 handoff. Metadata advances
to `2025.117` / `2026.114-law-integration-draft`; no readiness gate changes.

Final integration passes 132 tests in 14 files, including the current Rule 3
source and rule-pack metadata cases, root types and all 5,127 references. The
exact run is retained in `.local/upgrade-evidence/eic-child-investment-integration.log`.
