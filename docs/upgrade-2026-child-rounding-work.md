# Form 8814 allocation rounding

Refreshed 2026-10-25: [final 2025 Form 8814](https://www.irs.gov/pub/irs-pdf/f8814.pdf)
(created 2025-03-19), [its instructions](https://www.irs.gov/instructions/i8814),
and [Form 1040 rounding instructions](https://www.irs.gov/instructions/i1040gi).
The form requires ratios rounded to at least three decimal places. The existing
four-place truncation understated some preferential transfers. Six-place
HALF_UP ratios satisfy that requirement and are described in the audit.

Line12 is a plain subtraction. For actual qualified dividends1350.50 and
capital distributions1350.50, total income is2701 and excess income is1.
Both half-share transfers round to1, leaving line12=-1. Flooring that remainder
incorrectly put2 on the parent return. The signed remainder now reaches
Schedule1 and the child investment-income worksheet; it is not floored again
for NIIT or Form4952. Original source cents remain available; this is not a
blanket change to rounding on other forms or the source eligibility thresholds.

Spec updates and four failing regressions preceded implementation. Literal
ratio case1500/5016 rounds0.299043 and transfers693, rather than692.
The canonical parent case now reports300001AGI instead of300002, with
Form8960line7=-1. All73 focused cases across six form/return/edge/PDF files pass.
Two older tests now use literal expected dollar outputs instead of repeating
the implementation's ratio algorithm.

Exact tree7a333580 on8bbeef2 passes584tests across ten files, plus all three
rule-pack tests, root types,4217spec references and scoped lint (zero errors,
one existing warning). The facts agent independently reviewed the code and
published ratio, signed subtraction and investment-income instructions, then
reran all four new cases with no actionable finding. This is agent software and
source review, not independent human tax qualification.

The saved one-page reference PDF was reopened with pypdf and visually inspected.
Line12 and the parent Schedule1 total both retain-1; the reference-only label
remains and the child identity is absent. Artifact
`.local/upgrade-evidence/child-rounding-render/f8814-reference-filled.pdf`
has SHA2566d9ad0bec96e4c9399a5d7ccb5269d7066ac0bbc160239185300c0a6c33f5797.
Check logs use`child-rounding-exact-*`, `child-rounding-rule-packs.log`, and
`facts-review-8814-rounding.log` under`.local/upgrade-evidence/`.
Rule versions2025.52 and2026.48 retain existing completeness, review and filing
gates.
