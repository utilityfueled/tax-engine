# Married PA child and current care sources

The married ordinary-return calculation now accepts complete actual child
sources for Schedule SP and current joint paid-care sources for Schedule DC.
It reconciles both spouses' original identities, earnings, care receipts,
payment owners and document recipients. Unknown coverage, stale originals,
duplicate receipts and unsupported benefit or care methods reject.

The validated care credit reaches PA-40 line 23 and REV-1630 line 2 once.
Schedule SP and REV line 1a retain the original tax liability. Child counts
use the same actual joint eligibility income on both separate SP schedules.
All monetary calculations use Decimal; existing owner rounding remains.

The spec preceded genuine failing tests: 16 failed and 28 passed against the
old implementation. The final focused and adjacent suite passes 406 tests in
10 files, including 46 new controls. Product typecheck, scoped lint, new spec
references and diff checks pass. A separate fixture typecheck retains the same
12 existing imported diagnostics as its unchanged baseline; it is not a clean
typecheck result. An intermediate adjacent failure was repaired without
changing the existing assertion.

Distinct engineering review passes 30 additional actual-candidate controls,
including fractional rounding, lesser-spouse earnings, two-person limits,
separate-owner SP results, identity/source rejection and privacy. Positive
full-return examples use actual 2025 federal calculations. A standalone 2026
Form 2441/PA comparison is not evidence of full 2026 return qualification.
This engineering review does not replace qualified human tax review.

Sources include the [official 2025 REV-1630](https://www.pa.gov/content/dam/copapwp-pagov/en/revenue/documents/formsandpublications/formsforindividuals/pit/documents/2025/2025_rev-1630.pdf),
[Tax Reform Code section 304](https://www.palegis.us/statutes/unconsolidated/law-information/view-statute?act=2&chpt=3&iFrame=true&sctn=4&sessInd=0&smthLwInd=0&subsctn=0&txtType=HTM&yr=1971)
and [PA's federal-law conformity guidance](https://www.pa.gov/agencies/revenue/resources/tax-law-policies-bulletins-notices/tax-cuts-and-jobs-one-big-beautiful-bill-acts).
Before implementation, official REV line 2 corrected the preliminary proposal's
mistaken exclusion of the care credit; the original proposal remains preserved.

Married child/care paper exports remain denied because the existing projection
prints zero dependents. Native source entry, reviewed child rows and DC
attachments, actual local W-2 integration, broader state cases, full 2026 federal
law, final forms and qualified human review remain separate required work.
Public year, filing and model-promotion gates remain closed. Full integrated
checks are pending the other active packages.

Private author evidence: `nov05-pa-married-dependent-care-implementation`,
manifest 61194fa4716193fd35c7c071c65874b7ea453e54c67f4f100b7aaddd4a810750.
Distinct review: `nov05-pa-married-dependent-care-independent`, manifest
e367706bd62d55baecea76a98db5258144c5e4c8cb5671736c79e6628d4dc1ea.
Root verified all 44 evidence members and all eight current source pins.
