# Ohio resident-credit printed-form correction

Status: independently reviewed source adopted and main checks passed; prepared for commit. This is the actual 2025 scalar worksheet correction.
PA and Ohio all-three-residency launch implementation remains active, including
canonical resident-period eligibility, payment proof and NRC overlap prevention.
No filing, 2026 return or physical-form readiness gate changes.

The actual IT RC combines eligible states in Columns A and B before taking one
minimum. The former helper added separate per-state minima and did not truncate
the aggregate ratio. Actual AGI100,000/available tax2,000 with NY10,000/1,000 and
CA10,000/100 produces400, rather than300. The distinguishing rounding original
uses AGI30,000, eligible income10,000 and available tax5,003: fraction.3333 and
credit1,667, rather than1,668. Independent originals were recorded before outputs.

Sources retrieved November2,2026:

- [Actual 2025 IT RC](https://dam.assets.ohio.gov/image/upload/tax.ohio.gov/forms/ohio_individual/individual/2025/itrc-fi.pdf),
  SHA256 `ebd9960d6a8004d6803f0f22238f989043db794e9ebc9aa9fcb3d5588112cb48`.
  Printed lines1–7, grouped state cells and reciprocal compensation exclusions.
- [R.C.5747.05](https://codes.ohio.gov/ohio-revised-code/section-5747.05),
  effective September30,2025: aggregate limit, credit ordering, qualifying
  part-year resident income and no same-income NRC/resident-credit overlap.

Spec was updated before the new five-test red. Its original run failed a PDF
prerequisite; corrected-prerequisite run produced five actual failures. The first
implementation passed four and failed the one-sided-positive input case because
Decimal positive-zero semantics admitted it. Explicit gt(0)/lt(0) comparisons
corrected that finding, retaining known signed zero. All original36 historical
cases remain; obsolete per-state invented allocation assertions now use actual
printed totals and source rows. The original return integration amount663 remains.
No per-state credit is manufactured. Source A/B audit entries preserve originals.

Private verification:41 focused cases/two files and209 affected cases/four files
pass; engine/contracts/web types, spec validation and engine build pass. Scoped
lint passes with zero errors and62 existing test non-null warnings. The first web
type attempt lacked the private apps/web dependency link and failed next ENOENT;
linking existing installed dependencies allowed the unchanged command to pass.
No dependency versions changed. Evidence logs and both failed attempts retained.

Durable private evidence: `.local/upgrade-evidence/nov02-parent-oh-resident-credit/`;
independent source originals and source review:
`.local/upgrade-evidence/nov02-ohio-independent-source-review/printed-form-audit/`.
This agent review does not replace required independent human tax qualification.

Independent frozen-source execution passes six separately derived probes, including
aggregate400, truncated1667, same-state cents grouped before rounding1, post-NRC517,
reciprocal exclusion200 and validation before nonpositive-base shortcuts. Review
receipt SHA256 `3378d5b6045ccaa0694bf972d71a9d812b3115607ef533718fa465509b5cee93`.
Parent verified all six author/reviewer source hashes and both retained review
logs before adoption. The review first over-constrained the entire audit to seven
rows; narrowing to actual numeric lines preserved valid original A/B source audit
rows and all monetary originals. That failed attempt remains retained.

Main adoption verification passes nine commands:250 tests/six files, all three
type checks, spec6523/6523, current inventory613, scoped lint zero errors/62
existing test warnings and engine build. Main evidence is
`.local/upgrade-evidence/nov02-parent-oh-resident-credit-main/checks.json`.
The engine/spec/test bytes match the independently reviewed frozen source.
All required final integrated coverage/browser/runtime checks remain due after
selected-state implementation. Rule versions2025.223/2026.221 are unchanged.
