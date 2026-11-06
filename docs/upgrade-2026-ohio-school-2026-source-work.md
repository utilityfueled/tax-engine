# Ohio 2026 school catalog and source projection

The standalone annual 2026 catalog now preserves the official 214 taxing school
districts: 68 earned and 146 traditional. Codes, names, printed counties, rates
and bases match the [Ohio Rev. 3/26 annual publication](https://dam.assets.ohio.gov/image/upload/tax.ohio.gov/employer_withholding/2025-2026%20NYP%20Updates/School_Districts_2026.pdf),
raw PDF SHA-256 `3b13e9c6fd9ee63392401035322082b89ce9764a777c9637a0ef15a50a3d80e2`.
The independent reviewer extracted all rows directly from the PDF and checked
all 214 percentage columns and 32 new/expired/changed/renewed entries. Missing
or expired lookup is absence, not a no-tax residence determination; no future
levy date is inferred. Earlier 2025 lookup bytes remain unchanged.

A separate source API validates actual 2026 single-primary, under-65, full-year
ordinary W-2 earned-district facts. Current owner/address, year-specific Finder,
complete original W-2/state/local rows, payroll periods and category inventories
must reconcile. Unknown and zero stay distinct. Decimal sums documentary wages
and withholding; an opaque current context rejects stale or cloned proof and
returns detached projections without private original identifiers.

The legal source is [R.C. 5748.01(E)–(G)](https://codes.ohio.gov/ohio-revised-code/section-5748.01),
with [R.C. 5748.02](https://codes.ohio.gov/ohio-revised-code/section-5748.02)
as surrounding levy authority. This API calculates no school liability,
payment, refund, penalty or interest: those fields remain null. It does not
admit taxing-school facts to the ordinary return composer. Traditional, PY/NR,
joint, self-employed, specialized-compensation, native and final SD100 methods
remain separate work. Final 2026 and filing gates remain closed.

V1 independent review found two genuine false admissions: caller classification
could override an actual municipal or other-district printed locality. The
successor reads the actual validated original row and requires the printed code,
unique official name, or code/name combination. It rejects ambiguous or mixed
labels. A further genuine failure exposed Northwestern LSD's earned/traditional
name collision; code-less uniqueness now spans the entire 214-row catalog.
The explicit matching code remains accepted. Five quoted spec rules now work
with the unchanged strict global parser; V1's invisible references are retained.

Spec-first existing-lookup execution retains nine failures. V2 retains actual
249-pass/two-failure wrong-locality and 264-pass/one-failure ambiguity runs before
repair. Final author tests pass 265; distinct source review passes 390, including
all 68 earned name-only and 68 explicit-code cases and both original negatives.
No old assertion was removed. Extra fixture types retain exactly eleven old
baseline diagnostics; product types and six-file strict lint pass cleanly.

Root adopts the exact seven paths on `f957012d`. Current normal tests pass
1,074 in seven files (265 source/adjacent plus 809 strict references); inventory
suites add 66 controls. Root/contracts/web types, spec (8,397 references), checked
inventory, both builds and repository lint pass. All 881 old inventory rows
remain identical, with 68 supported. Three unmatched filename/spec rows are
conservatively unsupported. Root initially expected only the spec row and held
after regeneration; its receipt and original stale-inventory failure are kept.
Only the root verification assumption changed; no generator or product gate did.

Root's 33-member manifest:
`75d6bae2606bdd09ab06e52317880e94b6d4699499603614ee4054a7423ca22e`.
Author V2 `24a9088510eeba9e6defc4e4525ff1e5345b28546363ef81878c6e2ecf1c211d`;
distinct V2 `44c264c2ee7d2ddeaaa239113407aebef6e71192b7cb33e2dc2bb21e29ba7e71`.
This engineering source package does not complete selected-state support or
professional human, current full, hosted/self-host artifact or filing qualification.
