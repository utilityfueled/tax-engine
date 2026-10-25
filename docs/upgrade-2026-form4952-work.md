# Form 4952 source and printed audit

## Official source refresh — 2026-10-25

The [final 2026 Form 4952](https://www.irs.gov/pub/irs-pdf/f4952.pdf), created
May 28, 2026, includes instructions on pages 3–4. Its SHA-256 is
`90b9fc0bd6778983521b61ed5c94cc5668e62af858e38e94a1a6fd4b631bfb6d`.
The [final 2025 form](https://www.irs.gov/pub/irs-prior/f4952--2025.pdf) uses the
same printed arithmetic. The 2026 instructions permanently exclude miscellaneous
itemized investment fees after 2017. K-1 reporting alone does not establish that
an expense is deductible on the return.

## Calculation and actual facts

The spec was replaced before ten new source regressions were run; all ten
failed against the former simplified calculation. The corrected audit now
records printed lines 1–8, including 4a–4h. Line 4d is total net investment gain;
4e is the smaller of that total and actual preferential net capital gain; 4f
is their difference. The actual 4g election is bounded by 4b plus 4e. Its default
allocation uses capital gain first; an explicit valid “Elec.” allocation is
retained separately. Form 1040 qualified-dividend reporting is not reduced by
this core. Return-level Schedule D routing is a separate federal-owner package.

Current/confirmed source records require the actual year, reference, amounts
including zeros, and immediately prior carryforward year when nonzero. Defaults
on old parsed records cannot supply missing current amounts. Positive investment
expenses need actual deductible-on-return confirmation. Legacy 2025 inputs
retain the prior nonpreferential-gain interpretation with an unverified source
audit. The core uses Decimal and rounds aggregated source lines once; signed
income is preserved until the form's specified zero floors.

Independent paper expected values in the new regression are: 18,000 total
interest, 8,000 ordinary income, 9,000 total gain less 6,000 preferential gain,
2,500 actual election, 500 allowed expenses, 13,000 deduction and 5,000 carry.
Tests cover election bounds/allocation, signed income, half-dollar rounding,
missing facts, wrong years, nonfinite/negative inputs and historical behavior.
Old tests retain their monetary expectations with corrected printed line names;
the former incorrect line4c zero-floor expectation now follows the printed form.

## Physical PDF and review

The 2025 map copies unique finite canonical audit entries; it does not rebuild
an independent calculation. Missing, duplicate, negative or inconsistent lines
reject. The saved PDF preserves actual zero values, the optional election note,
a source-status notice and the review-only stamp. Its synthetic file has all
17 expected canonical values and 17 matching widgets with nonempty appearances.
The page was rendered and visually inspected, including the “Elec. 2000” note.

The final 2026 blank and inspection-only field map are physically separate.
The early field identifiers differ from 2025, and the 2026 map is unregistered.
No filing or 2026 review-export gate is opened.

An independent agent refreshed both official revisions, ran the focused checks,
reviewed the formula/source/PDF diff and inspected the election rendering. It
found one P2: a missing calculation returned an identified official blank before
review stamping. A regression reproduced that behavior, then the map was changed
to reject before template I/O. This is agent review, not independent human tax
or final-form qualification.

## Verification and remaining integration

- Ten source and three mapping regressions failed before their implementation;
  the review finding produced a further one-failure/four-pass regression run.
- Final focused run: **76 tests pass across five files**, including saved-PDF
  election text and the missing-calculation guard.
- Root and contracts types pass. All current spec references resolve. Scoped
  lint has no errors; existing non-null assertions remain in the legacy PDF test.
- Local evidence is under `.local/upgrade-evidence/form4952-*`, including red,
  corrected, type/spec/lint logs, saved PDF, rendered PNG and canonical/widget
  inspection. The final source response is also in the dated form-source register.

Federal integration must forward the actual year/source fields, reconcile K-1
expense deductibility and use Schedule D election inputs without changing the
reported qualified dividends. That work remains assigned to the federal owner.
Independent human review and final export qualification remain open.
