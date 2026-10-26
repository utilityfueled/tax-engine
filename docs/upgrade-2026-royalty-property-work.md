# Actual direct royalty property expenses

This package adds an optional original-source property ledger. The pre-existing
raw MISC contract is retained separately; absent property facts do not become a
confirmed expense ledger. The guide and physical Schedule E property columns
remain follow-through work, not completed by this calculation package.

Sources refreshed October 26, 2026:

- [Schedule E instructions](https://www.irs.gov/instructions/i1040se), Part I
  lines 4 and 5–21: separate properties, gross receipts and current expenses.
- [Publication 596](https://www.irs.gov/publications/p596), Worksheet 1 lines
  8–10: royalty gross less related expenses, separately from passive activities.
- [Form 8960 instructions](https://www.irs.gov/instructions/i8960), lines 4a/4b:
  retain the completed portfolio income and subtract no expense a second time.
- [PA Schedule E instructions](https://www.pa.gov/content/dam/copapwp-pagov/en/revenue/documents/formsandpublications/formsforindividuals/pit/documents/2025/2025_pa-40e.pdf):
  state classification, ownership, expense and situs treatment are independent.

The ledger binds each property allocation to the original MISC index, source ID,
account, payer, owner, year, revision and Box 2 amount. Every positive original
must reconcile in total; duplicate originals or receipts reject. All classification,
cash-method, expense-completeness and current-year paid-date answers are actual
facts. Missing values remain unknown and explicit zero remains zero. The core
accepts current ordinary commissions, insurance, professional fees, management
fees and property/production taxes. It preserves each category and owner without
embedding private source IDs or references in its audit entries.

Decimal aggregation preserves source cents. Schedule E returns gross royalties,
direct expenses and net portfolio royalties separately; EIC subtracts the actual
expenses before its royalty zero floor and NIIT retains the resulting net income.
Original K1 royalties and passive losses remain independent. No entered net amount,
inferred expense, fabricated property or calculated allowance is accepted.

Interest, depreciation, depletion, prior disallowed expenses, losses requiring
at-risk history, business/disposition/foreign and community-property methods are
explicit unfinished methods. The new actual-property attachment cannot silently
fall through the old PA gross-only path; PA rejects it pending its actual state
property method. That guard is not counted as implementation. Existing raw
input treatment and all public readiness/filing gates remain unchanged.

Spec-first evidence is retained locally in `royalty-property-red.log`: four
canonical cases fail before implementation, reproducing omitted expenses and
ignored/stale source attachments. `royalty-property-pa-red.log` independently
reproduces the silent PA fall-through. Six property controls plus the PA boundary
now pass with 842 adjacent checks across 11 files, root types and 5,199 references
on the development base. Scoped lint has zero errors and three existing warnings.
The earlier 473-case diagnostic accidentally named a nonexistent Schedule E path;
the final command names its actual schedules path and includes all requested
Schedule E cases. Initial type diagnostics are retained; the final structural
source input preserves the charitable collector's consumed taxpayer type.

Synthetic literal controls include 12,000.25 gross minus 999.75 expenses =
11,000.50 net, 418 NIIT at 200,000 wages; split originals totaling 1,000.01 with
300.03 expenses plus 50.02 independent K1 royalties = 750; and five expense
categories of 100.01 attributed to the actual spouse. They are independently
stated arithmetic controls, not published IRS examples or human qualification.
Fresh integrated-tree checks and separate agent review follow before delivery.

The immutable review tree `415359a0c1167046eefbd7cdbecce933547a9de5`
on `2011778` passed 845 adjacent tests in 12 files, root/web types and 5,208
spec references. That command also contained a nonexistent validation-directory
filter for the charitable source test; the final integration command uses its
actual `tests/guided-interview` path. Its DOM case was included originally.

A separate agent verified all twelve owned hashes and passed 12 cases in three
files, including five private controls for the zero-net/one-cent-loss boundary,
split cents and reordered sources, separate joint owners, unknown/date/duplicate/
stale sources and audit privacy. Sources were independently refreshed. Evidence
is `federal-royalty-property-review.log` and its snapshot manifest in the local
evidence directory. This is software/source review, not human tax qualification.

The reviewed patch applied without conflict on `be0b6be`, preserving the separate
cash-distribution calculation and guided charitable structural input. Rule
versions advance to 2025.125 / 2026.122-law-integration-draft. Final scoped checks
and normal-push evidence are retained locally. PA actual property treatment and
physical/guided follow-through remain active work.

Final integration passes 119 tests in eight named files, root/web types and
5,219 references; the corrected charitable source path is included. All eleven
non-ledger reviewed source blobs are byte-identical to the reviewed freeze.
`royalty-property-integrated-{tests,types,web-types,spec}.log` retain the checks.
