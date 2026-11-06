# Schedule D special-gain worksheets

The first isolated package implements the arithmetic for the printed line18
and19 worksheets from the [official Schedule D instructions](https://www.irs.gov/instructions/i1040sd),
refreshed2026-10-25. It has no public input property or canonical caller yet.

The 28% worksheet combines signed collectibles and the actual section1202
worksheet component before subtracting short-term and long-term carry losses.
The1250worksheet applies per-property ordinary recapture, the business1231gain
limit and lookback, then other actual1250sources and the remaining loss offset.
A child-derived730collectible/1460unrecaptured subtotal with1000short loss leaves
zero28%gain and1190unrecapturedgain. A different actual collectible loss increases
the1250offset; a short-term gain does not erase long-term carry losses here.

Section1202line2 is specifically the excluded amount for a50%exclusion,
two-thirds of a60%exclusion, one-third of a75%exclusion, and zero for100%.
It is not every taxable gain above an issuer's exclusion cap. The module's
parameter is named `section1202WorksheetComponent` to make this boundary clear.

Spec preceded seven failing cases (missing implementation); all seven literal
cases then passed. Independent agent source/code review and the same seven cases
passed without an actionable arithmetic finding. This is agent review and
independently derived arithmetic, not a human tax review or IRS numeric example.

Remaining implementation before using these amounts:

- Bind actual source year/identity and every long-term asset classification;
  reconcile parent, child, DIV/K1, property and other-form sources without guesses.
- Supply section1202issuer/acquisition/exclusion history and actual worksheet
  component; preserve unknown installment and partnership-disposition history.
- Integrate final18/19 values in regular/AMT/foreign-income tax computation and
  physical ScheduleD, including the foreign-earned-income worksheet footnote.
- Complete guided source intake, exact saved-PDF inspection and broad regression
  checks. Child positive special-gain calculation remains gated until its actual
  supported source cohort is connected. No filing gate changes in this package.

## Isolated verification

The staged code tree `3fb202d53b49c8800267d52a3a200581ec21497c`
passes 69 tests across the new worksheet and existing Schedule D suites,
root TypeScript, 4,259 spec references and ESLint with no errors or warnings.
Evidence is in `.local/upgrade-evidence/schedule-d-special-exact-{green,types,spec,lint}.log`.
The independent agent review log is
`.local/upgrade-evidence/agent-schedule-d-special-gains-review.log`.
The subsequent change to this paragraph only records those results.

## Actual source integration

The next package binds the source year and actual household identity, every
long-term original trade and every DIV/partnership/estate capital component.
Missing sources and asset classifications remain unknown. Original facts are
compared with their referenced return records; collectible gain is recomputed
through Form 8949. Partnership 1250 gain receives the actual section 1231 and
lookback limit before DIV/estate/child sources enter the other-source subtotal.
The final estate capital-loss carry is included once.

The six initial tests failed before implementation. Subsequent conflict tests
also reproduced an invalid calendar date and a contradictory AMT source being
accepted; both are corrected. The actual child example supplies Schedule D
18/19 = 0/1190 and AMT Part III 13/14/15 = 2190/1190/3380. A same-basis/carry
confirmation is required before deriving AMT sources; conflicting actual AMT
facts reject. This is independently derived arithmetic, not an IRS example.
The independent agent also verified a distinct K1/estate case (business 1250
3000 plus estate 2000 = 5000) from the official worksheets.

This initial contract is bounded to original classified capital assets and
reported DIV/K1/1041/child sources. Property sales, transformed digital assets,
installments, other-form sources, QSBS exclusion history and foreign-income
worksheet modifications still require their separate complete source methods.
These are internal implementation tasks. Guided intake and final qualification
remain separate; no filing gate or year-readiness status changes.

The isolated code tree `7f19cab20ff0a11583e346ffbe1288b417eac276` passes
162 tests across nine source, canonical, AMT, metadata and saved-PDF suites.
Root TypeScript and all 4,284 spec references pass; ESLint reports no errors
and four pre-existing federal non-null assertion warnings. Evidence is in
`.local/upgrade-evidence/schedule-d-source-{final-tests,exact-types,exact-spec,exact-lint}.log`.
Independent agent code/source review and a separate K1/estate arithmetic probe
found no actionable issue; these are agent checks, not human qualification.

The saved review PDF was reopened and both pages were rendered and inspected.
It uses the actual review identifier-redaction path, leaves the SSN blank and
retains the review-only footer. Schedule D contains the actual 4,380/3,380 gains
and line 19 amount 1,190; zero line 18 and the loss-branch special-rate fields
remain blank. The saved artifact is
`.local/upgrade-evidence/schedule-d-special-source-reference.pdf`, SHA-256
`3db59e3b30d10d99806b96dd59442ba5fd4c0ecb8edf3b516a4e104b75ccb152`.
Source references are not printed in the PDF. Filing qualification remains open.
