# Confirmed benefit, education and Marketplace years — November 15

Confirmed explanations now reject known conflicting original calendar years on
SSA-1099, 1098-E and 1095-A records, including zero amounts, withholding-only
records and duplicates in either order. SSA uses its actual `sourceTaxYear`;
the other forms use `taxYear`. Missing years remain unknown. Historical
preliminary calculations and all annual readiness gates remain unchanged.

The [SSA statement authority](https://secure.ssa.gov/poms.nsf/lnx/0205002010),
[2025 student-interest instructions](https://www.irs.gov/pub/irs-prior/i1098et--2025.pdf)
and [2025 Marketplace instructions](https://www.irs.gov/pub/irs-prior/i1095a--2025.pdf)
identify the statement calendar year. That year is distinct from earlier benefit
entitlement, loan origination or the following-year delivery date. Six actual
primary-source GETs and their hashes are retained. No new monetary formula or
2026 form mapping is introduced.

Spec-first verification preserves nine genuine failures before the guard change.
Author checks pass 106 focused and 162 adjacent tests; 37 new actual authenticated
in-process POST cases exercise admission and unchanged amounts. Separate review
passes 62 tests and seventeen additional POST cases, including optional SSA
absence, combined income/deduction/withholding conservation and actual earlier
SSA lump-sum history. Denials are generic, private and no-store, with no provider
or accounting effects. Accepted accounting is observed once at a mocked boundary.
The reviewer's first combined student-interest oracle omitted the existing
phaseout; that failed review is retained and corrected from Publication 970
without changing product or author test bytes.

Main passes 107 tests in three files, all 27 spec references, web types, scoped
lint and the unchanged 1,030-row inventory. Browser metadata changes one source
hash and its dependent binding. All 643 case identities and prior action/deadline
policies remain unchanged.

Frozen candidate: `e47afc2b26e1e42d88f5bbae28151462710e22b4eb6d8cb42b2fd2438ab7efbd`.
Separate review: `ed6e6f7b8a87a7bbd4ae4867a4cd344ddaea9634884bd43d1685f49d1c3f7f70`.
Root evidence: ignored `nov15-confirmed-three-calendar-root-review/`, main receipt
`8978bb1772b393b1b5e82ee9d2991db1fb93b47f4301923420ce3a0511b6469c`. W2G retention and K1 fiscal-period semantics are separately reviewed.
Current integrated/runtime qualification, qualified human review and final
2026 readiness remain open.
