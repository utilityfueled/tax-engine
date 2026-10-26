# Distinct original prepaid tuition benefits

This package extends actual in-kind tuition assistance to several distinct
expenses and original statements for one student. Every expense retains its
own original benefit, recorded assistance, actual credit allocation and known
zero refund/other-benefit answers. Each original statement retains its earnings
and basis. One actual statement may document several distinct benefits.

Official sources refreshed on October 26, 2026:

- [IRC529(c)(3)(B)(i), (v)](https://uscode.house.gov/us/usc/119-118/t26/s529/)
  provides the in-kind exclusion and assistance/credit coordination.
- [Publication970, chapter7](https://www.irs.gov/publications/p970) supplies
  the AQEE earnings fraction and separately established additional-tax exceptions.
- [Form1099-Q instructions](https://www.irs.gov/instructions/i1099q) identify
  the original Box1 benefits and reported earnings/basis.

The original spec and four failing cases were saved before implementation in
`.local/upgrade-evidence/distinct-in-kind-assistance-red.log`. The failure was
the existing one-expense/one-statement guard. The new source helper validates
the complete original group in both the engine and reference renderer; it
does not spread assistance or select a tax allocation. Existing cash/ESA,
unbound-extra-expense, duplicate-benefit and unknown-fact tests remain unchanged.

Independent Decimal derivation: the original4000benefit with800earnings and
1000assistance leaves3000qualified expense,600excluded and200taxable earnings.
The separate6000benefit with900earnings and1500assistance leaves4500qualified
expense,675excluded and225taxable. The same recipient has425taxable earnings
and43additional tax after dollar rounding. Actual credit expenses1000/500
reduce the two allocations to2000/4000, produce400/300taxable earnings and
200/75credit exceptions, preserving43additional tax. These are derived
synthetic examples, not published IRS numerical examples or human qualification.

Initial source-path checks pass7tests in5files, including actual guided input,
canonical2025/isolated2026, private source validation and independently reopened
PDF/workspace packets. The adjacent calculation cohort passes11tests in4files;
root types pass. The real2026 gate remains asserted. Broader exact verification,
separate review and retained rendered artifacts are recorded before delivery.

The first immutable broad cohort on treeb11737b5 passed205cases and failed the
new balanced-edit confirmation regression. The central flow invalidated this
packet for external credit/bond edits but omitted its own distribution records.
The failure is retained in`distinct-tuition-exact-unit.log`, with the focused
spec-linked red in`distinct-tuition-self-edit-red.log`. One additional comparison
now clears the packet confirmation for its own source edits. Confirmation alone
does not change the source records and can be explicitly restored afterward.
The original immutable snapshot is preserved for review provenance.

The corrected V2 snapshot31290c1b passes1076cases and exposes one neighboring
fixture that edited education facts but later expected its inherited confirmation
after reconfirming only the loan facts. The fixture now asserts that the education
edit clears its own confirmation, explicitly reconfirms education, checks that
this does not reconfirm the loan, and retains its original final assertion after
the loan is confirmed. No executable code or original assertion was removed.
The V2 failure and unchanged reviewed source snapshot are retained.

Separate agent review of V2 verified all14owned hashes and passed11cases across
six files, including four private controls for unequal statement earnings,
one statement with two benefits, source order, explicit zero/unknown facts,
recipient identity and stale source references. The reviewer refreshed the IRS
instructions, IRC529, Publication970 and Notice2016-13; separate original
statements remain separate after the post-2014 aggregation repeal. This is a
bounded agent review, not independent human tax qualification.

Corrected immutable tree5e34e857 passes1077tests in155files, root/web types,
spec validation, scoped lint and both production builds. Every owned source hash
was unchanged after verification. Separate review of the narrow test/spec delta
passes11cases in3files, including the same four independent tuition controls and
all six neighboring loan cases; all15frozen hashes match. No executable code
changed between V2 and V3.

Eighteen retained PDFs generated on the unchanged V2 executable source contain
38pages. Independent pypdf reopening verifies21literal Form1040/5329/8863 fields,
absent original tax identifiers and one review notice per page. All38pages were
rendered with Poppler and visually inspected, including separate4000/6000source
records, the single10000statement with two benefits, and actual credit exceptions.
Artifacts and per-file hashes are in
`.local/upgrade-evidence/distinct-tuition-v2-artifacts/reopened.json`.

Evidence: `distinct-tuition-v3-exact-checks.json`,
`facts-distinct-tuition-review.json`, and
`facts-distinct-tuition-v3-review.json` under `.local/upgrade-evidence` preserve
exact trees, test counts and log hashes. Earlier failures remain separate.

Shared expenses, unallocated assistance, mixed cash/ESA groups and refunds remain
their separately named source methods. This package does not qualify final2026
forms, filing, human tax review, hosted operation or release readiness.

Final integration rebases the reviewed source onto`360f3405fae9a092b641e931cffe16521e1dd840` and preserves
its shared-health and charitable-NOL work. Only the existing flow file combines
nonoverlapping source-confirmation changes. Rule provenance advances to
2025.132 / 2026.129-law-integration-draft; readiness gates remain unchanged.

Final immutable tree `6d698b68` passes 1,081 tests in 156 files, another
25 readiness/rule-pack/credit-sales cases in three files, root/web types,
5,355 spec references, scoped lint (zero errors; 82 existing warnings), and both
production builds. Separate final-delta review verifies all 16 hashes, preserves
the committed health-source changes and confirms unchanged readiness gates.
All 15 non-ledger delivered blobs match that exact tested tree; only this
validation paragraph is added for the commit.
