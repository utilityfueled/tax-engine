# Actual marriage-year Marketplace intake

The credits section now reaches the existing marriage source method. The user
copies the actual joint household and original Forms 1095-A, then supplies the
marriage date, January/December answers, dependent qualifications and separate
family assignments, original coverage confirmations, and corrected alternative
monthly benchmarks. The return retains the ordinary household reconciliation
separately and computes its actual income and worksheet comparison.

Copy actions preserve original exact records and leave unknown answers blank.
The benchmark-row action copies only owner, month and covered-person groups from
the actual source periods and dependent assignments. It supplies no SLCSP,
reference, qualification, income or credit. Empty source groups still require
an actual zero benchmark. The original filer recipient determines policy groups;
the dependent assignment determines each alternative family's coverage interval.
The canonical facts-only binder revalidates all identities, years, snapshots,
eligibility answers and monthly source conservation before handoff. No fake AGI,
taxpayer identity, allowance, repayment or current credit is used for validation.

Substantive household, income, policy, assignment and benchmark edits revoke the
outer source confirmation, marriage confirmation and benchmark confirmations.
Confirmation-only edits do not loop. Reconfirming stale originals does not make
them valid. The existing bridge forwards this verified source packet once.

Official sources refreshed 2026-10-25:
- https://www.irs.gov/publications/p974 — Alternative Family Size, Table A,
  Steps 2 and 4, corrected SLCSP and original recipient groups.
- https://www.irs.gov/instructions/i8962 — Table 4 and Part V.

The source/helper tests first failed because the new source module did not exist.
The full credits-component test independently failed on the missing marriage
date control. Six source/DOM cases now pass, including the actual guided
117,000-income, 7,021-credit, 8,423-advance and 1,402-repayment control, exact
source cents, false/zero/unknown distinctions, source-only 2026 binding and the
closed full-return gate. Broader exact checks, browser persistence/privacy and
independent review are recorded below before integration.

This collector uses only the committed bounded method. First-day weddings,
Part IV plus marriage, special coverage and coupled self-employed health retain
their explicit source-method limits. Ordinary two-owner health/PTC remains
separate implementation. No human tax qualification or filing approval is
claimed.

Exact review tree `000fad61` passed 2,445 adjacent tests; one legacy test expected
the old generic worksheet message when a single filer selected marriage. The
new source method correctly rejects that filing status as not a married joint
return. The assertion now checks that precise guard; 13 source/DOM/legacy cases
pass. New test assertions use checked fixture access rather than non-null casts;
this changes no expected amount or source boundary.

Root and web types, 4,956 spec references, and the production build passed. The
production Chromium flows passed at 1280 and 390 pixels with zero retries,
retaining edited source references and exact benchmark cents across reloads,
revoking confirmations, preserving blank values and original policy amounts, and
checking that identifiers/source references were absent from request bodies.
Both saved screenshots were inspected for readable controls and overflow.
Logs: `guided-marriage-exact-*`, `guided-marriage-test-delta.log`,
`guided-marriage-test-lint.log`, and `guided-marriage-browser.log` under
`.local/upgrade-evidence/`. Final rebase and independent review follow below.

Final reviewed tree `1d7dcc64` on `d777a68` passed 2,447 tests in 267 files,
with 33 existing skipped tests in three files, root/web types and 4,965/4,965
spec references. Lint on all new product/test paths and edited product paths
reports zero errors and zero warnings. The product blobs are identical to the
production bundle used for the two passing browser cases.

Independent agent `complete_facts` refreshed Pub974/i8962 and inspected original
source grouping, helper, component, bridge, invalidation and browser assertions.
Its nine passing cases include three private probes for dependent qualifications,
duplicate normalized months, reordered originals/index aliases, an empty
recipient group requiring an explicit zero benchmark, exact sub-cent precision
and input immutability. Evidence: `complete-facts-marriage-review.log`. Those
private probes remain outside the committed package. No actionable finding
remains in this bounded source/UI slice; this is agent review, not human tax
qualification. The final evidence-only ledger update changes no product blob.
