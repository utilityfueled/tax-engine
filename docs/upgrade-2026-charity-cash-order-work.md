# Historical public cash carry ordering

This bounded change completes the 2025 mixed public-cash carry and current public
property method. It removes the explicit method rejection; the existing category
formulas already consume current G, then prior G, before applying property limits.
Actual source identities, histories, valuation, FIFO, expiry and final deduction
selection remain required.

Sources refreshed October 25, 2026:

- [2024 Code section 170(b)(1)(G)](https://www.govinfo.gov/content/pkg/USCODE-2024-title26/html/USCODE-2024-title26-subtitleA-chap1-subchapB-partVI-sec170.htm): the text applicable in 2025 keeps cash and its carry in G, excludes G from A, and reduces A's limitation by aggregate allowed G, explicitly in carry years.
- [Final 2025 Publication 526, Carryovers](https://www.irs.gov/publications/p526): current-before-carry priority applies within each category, with older origins first.
- [Regulation 1.170A-10](https://www.ecfr.gov/current/title-26/section-1.170A-10): the separate A/C reservations remain after the allowed cash category.
- [Public Law 119-21, section 70425(c)](https://www.govinfo.gov/content/pkg/PLAW-119publ21/pdf/PLAW-119publ21.pdf): amended G/A/B and floor provisions apply to years beginning after 2025. Current consolidated wording is not substituted into the 2025 method.

The following are derived statutory controls, not IRS-published mixed-G examples:

| Base | Current G | Prior G | Current A / C | Deduction and retained source balances |
| --- | --- | --- | --- | --- |
| 100,000 | 0 | 40,000 | A 20,000 | Prior G 40,000 + A 10,000; new A carry 10,000. |
| 100,000 | 40,000 | 30,000 | A 20,000 | Current G 40,000 + prior G 20,000; prior G remains 10,000 and new A carry is 20,000. |
| 50,000 | 0 | 20,000 | C 40,000 | Prior G 20,000 + C 5,000; new C carry 35,000. |

The last control distinguishes source balances even when a wrong priority would
produce the same total. Exact cents, fifth-year expiry, deliberately unordered
source rows and standard-year treated-paid amounts have separate assertions.
The canonical review case uses actual wages and confirmed property facts, then
reopens physical 12=5,000, 13=20,000 and 14/17=25,000 after original identity
preparation and redaction.

Spec entries preceded the four pure red cases and the separate canonical/PDF
red case. Both logs (`charity-g-2025-red.log` and
`charity-g-2025-canonical-red.log`) record the former method rejection. The first
green cohort has 15 tests in three files. This is agent software/source evidence,
not human tax or filing qualification.

The immutable review tree `36b6cb641414307e749164019fa1cdbe78b2eb8f`
passed 228 tests in 27 files, root types, 4,720 spec references and scoped lint
with zero errors or warnings. Logs are `charity-g-36b6-{tests,types,spec,lint}.log`
under `.local/upgrade-evidence/`. Parent independently refreshed the historical
source/effective-date boundary, read the scoped diff and reran the five new
engine/PDF cases; all passed with no actionable finding in
`parent-charity-g-review.log`. That review is agent source/software evidence.
The final package rebases those unchanged executable/spec/test blobs onto the
refund prerequisite `b17b724`, with metadata `2025.78` / `2026.74-law-integration-draft`.
Final isolated tree `6c91026b2fad26d3ed5be4c45e671fd2857f0044` passed
21 focused/strict-reference tests plus three rule-pack tests, root types,
4,723 spec references and scoped lint with zero errors or warnings. Logs are
`charity-g-final-{tests,metadata,types,spec,lint}.log`. All six executable/spec/test
blobs match the independently reviewed tree; only metadata and this evidence
record changed. The initially supplied metadata test selector matched no file;
the actual `tests/models/rule-packs.test.ts` was then run and passed separately.

Remaining separate methods are unchanged: same-year private cash/noncash source
allocation, 2026 floor/nonitemizer coordination, and actual prior/mixed regular
and AMT NOL/charity coordination. Conservation, changed filing units and special
elections retain their explicit actual-method guards.
