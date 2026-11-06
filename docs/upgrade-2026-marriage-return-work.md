# Marriage-year Marketplace return and review output

The canonical Form8962 calculation now consumes the independently bound original
marriage sources and completed Pub974 WorksheetsI–V. Actual AGI and statutory
addbacks come from the existing return calculation; no supplied household income
or repayment override is introduced. Ordinary joint eligibility stays distinct
from an applied alternative pre-marriage calculation. An actual2026 joint401
percentage can coexist with eligible alternative-family months; post-marriage
credit remains zero and the full-year/filing gates stay closed.

A complete ordinary monthly comparison is reconciled before the alternative
result replaces only monthly and final credit/repayment lines. Actual PartI
income and poverty percentage remain unchanged. Step8 keeps additional credit
zero and omits27–29 when advances do not exceed alternative credit. A no-benefit
comparison retains the ordinary monthly result, with no PartV election. Original
zero months outside coverage remain in the source record and retain zero advance
audits, without creating alternative coverage.

The physical2025 review form now prints actual35/36, monthly values and transfers.
The reference includes the completed I–V comparison and original policy totals.
An opaque private context recomputes the full original return before rendering;
whole-input and calculated-result/transfer digests reject stale sources, forged
tokens and altered intermediate amounts. Structured SSN arrays are removed only
from render copies. Original exact sources are preserved privately. The shared
context now recognizes the actual Sched2/Sched3 audit labels as well as the long
labels, so changed transfers cannot evade reconciliation.

Sources refreshed2026-10-25:
- https://www.irs.gov/publications/p974 — Alternative Calculation, Steps1–8 and I–V.
- https://www.irs.gov/instructions/i8962 — Table4, PartV and monthly reconciliation.
- https://www.ecfr.gov/current/title-26/section-1.36B-4 — (b)(2), including actual
  over400 joint-income alternative examples and the prohibition on additional PTC.

The four canonical tests first failed on the existing marriage method gate.
The three PDF tests first failed on the original shared-policy-only context.
After implementation, all11 canonical/marriage/shared-policy checks and root
types pass. Saved bytes are reopened using independent pypdf, including widget
appearance and review-notice assertions. Exact rebased checks, independent
review and visual evidence follow below before integration.

The frozen `6a706a44b731cd4dd101023a3bdcdff9cd2a64a6` tree on
`b2f3796434dc9c5a3843236905b792aa8818a181` passed 78 focused and strict-spec
tests across eight files, followed by 151 adjacent credit, ordered health,
passive, NOL, shared-policy and review/redaction tests across fifteen files.
Root and web type checks and all spec references passed. Scoped lint had zero
errors; its one new unused test import was removed before the final snapshot,
leaving the five existing non-null assertion warnings in the PDF modules.
Evidence is retained in `marriage-return-exact-{focused,consumers,types,webtypes,spec,lint}.log`.

The saved physical form's two pages and reference appendix's twelve pages were
rendered with Poppler and inspected. Actual monthly values, Part V's 400/148
contributions and January–July periods, 7,021 total credit, 8,423 advances and
1,402 repayment are legible. The independent reader verifies field-tree and
widget values and appearances. Review notices are present in extracted text
and rendered pixels on every page. The original source identities remain
private; actual policy totals and completed worksheet values remain visible.
Artifacts and the renderer configuration are in
`.local/upgrade-evidence/marriage-return-render/`. The initial Poppler invocation
could not use its default font-cache directory; an explicit local Fontconfig
file and writable cache produced the final pages without renderer diagnostics.

Independent parent review of the frozen package found that the actual workspace
export prepared this private context only for shared policies. A marriage packet
therefore lost its identifiers before validation. Both the parent's private probe
and a permanent spec-linked workspace download regression reproduced the same
missing-identifier error. The export now uses the general premium-source predicate
before redaction. The permanent regression passes through canonical calculation,
source context, rendering, packet merge and independent saved-PDF reading. Only
the guided bridge ingress is supplied as an actual source fixture, because the
marriage collector is the next package. It also checks unchanged originals, no
SSNs in saved pages, and rejection of a one-mill source change. The source and
arithmetic review had 30 passing cases before that export correction; corrected
independent and final rebased checks are recorded below.

Remaining work is explicit: the actual guided marriage collector and ordinary
two-owner SE-health/PTC coordination remain internal implementation. First-day
weddings, combined PartIV+marriage and the preserved source-method exceptions
are not enabled by this package. No human tax qualification or filing approval
is claimed.

The corrected frozen `b6a2bab15aa744c8e050ef9158c13c6c5b1177ad` tree on
`e586f87a65708927e63c616707a10274176de61c` passed 251 tests across 25 files,
including the actual workspace export, all scoped marriage/shared-policy and
ordered health/NOL consumers, strict spec structure, and saved-PDF checks.
Root/web types, all 4,944 spec references, and scoped lint passed with zero errors
and five existing PDF non-null assertion warnings. Logs are
`marriage-return-final-{tests,types,webtypes,spec,lint}.log`.
The parent independently reran 32 cases across five files, including the unchanged
formerly failing workspace export and two additional canonical/source probes.
No actionable scoped finding remained; evidence is
`parent-marriage-return-corrected-review.log`. This is agent source/software
review, not independent human tax or form qualification. The final ledger-only
update does not change those tested executable, spec or test blobs.
