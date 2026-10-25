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
