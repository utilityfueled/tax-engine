# Form 2210 Schedule AI

## November 13 follow-up

`06f43988` applies the ordinary $400 net-earnings minimum before rounding in
each owner's Part II. At $433.13 profit the exact adjusted amount is
$399.995555. At $433.14 it is $400.004790. The first amount produces zero
tax. The second produces $244.80 in column (a) with zero covered wages. The
2025 PDF uses the audited Part II amounts. Two calculation tests and one
physical-PDF test reproduced the old result. All 237 affected tests in 18
files passed after correction. [IRC §1402](https://uscode.house.gov/us/usc/119-118/t26/s1402/) ·
[Schedule SE](https://www.irs.gov/pub/irs-pdf/f1040sse.pdf).

`656fb5f8` adds the ordinary preferential-income method. Publication 505
applies the period multiplier independently to actual qualified dividends
and ordinary net capital gain. Final 2025 Form 2210 instructions send line 14
to the applicable return worksheet, so the method uses the return's tax-table
or worksheet calculation. The guided path requires confirmation and clears
it when period values, source year or method change. Column (d) reconciles
both components exactly to the return. A 2025 single-filer example prints
$16,455, $21,035, $28,757 and $32,567 on line 14. The same example using
isolated 2026 statutory rates yields $16,170, $20,750, $28,424 and $32,234.
Special-rate gains, QSBS and investment-interest elections remain separate.
The preferential PDF requires a fresh original-source context. An offsetting
one-cent change in the two year-end inputs invalidates the prior review.
All 230 affected tests in 16 files passed, along with three type checks, the
spec inventory and strict 599-case browser collection. Final 2026 Form 2210,
final tables and professional review remain open. [Final 2025 instructions](https://www.irs.gov/instructions/i2210) ·
[2025 Publication 505, Worksheet 2-8](https://www.irs.gov/pub/irs-prior/p505--2025.pdf) ·
[2026 Publication 505, Worksheet 2-10](https://www.irs.gov/publications/p505).

`addd7688` clears the guided confirmation if underlying return facts or the
worksheet reference change, even when period amounts match the previous
values. The two regressions failed before the fix. Payments-only changes
preserve the confirmation, and source or method changes preserve the amounts
for review. The mobile production case covered exact cents, known zero, an
unknown blank, reload and reconfirmation. The case also checked that the
worksheet reference and fixture personal identifiers did not enter POST
bodies. All 69 focused tests and 24 actual Chromium cases passed. The
separate strict audit covers 600 cases, retaining the five hosted-only
skips and the 14 diagnostic cases.

Publication 505's 2026 estimated-tax worksheet adds the nonitemizer cash
charitable amount to its standard-deduction row and puts Schedule 1-A on line
9b. The draft Form 2210 still describes line 7 as the standard deduction
from Form 1040 and refers line 9b to instructions. On November 13 its
instruction endpoint still served 2025. The two publications serve
different calculations. Actual-year routing and earlier-period treatment
need the 2026 Form 2210 instructions and review.
[Publication 505, Worksheet 2-9](https://www.irs.gov/publications/p505) ·
[Draft 2026 Form 2210](https://www.irs.gov/pub/irs-dft/f2210--dft.pdf) ·
[Form 2210 instructions](https://www.irs.gov/instructions/i2210).

## Original package

The annualized income method was rejected. It lowers or removes the penalty for taxpayers whose income arrives late in the year, so the regular method overstated their penalty. This package calculates Schedule AI for calendar-year individuals.

## Rule

Form 2210 (2025) page 3 fixes the multipliers (4, 2.4, 1.5, 1), applicable percentages (22.5, 45, 67.5, 90), Part II factors and line order. Line 29 prorates the wage base by 3, 5, 8 and 12 twelfths; the 2025 printed limits are the check. Line 27 replaces one-fourth of line 9 as Part III line 10, and the existing dated penalty runs unchanged.

## Limits

- The original package rejected a positive qualified dividend or net capital gain. The November 13 follow-up documents the supported ordinary method and remaining special cases.
- Lines 9, 16 and 18 are actual entered amounts because each depends on its own period worksheet.
- Schedule 1-A follows the line 14 instruction, which lets a filer adjust taxable income for a provision with no line elsewhere and names Schedule 1-A, but gives no period rule. So each period is an actual entered amount, and the guide asks for the deduction through that period, not annualized, until a reviewer rules. Column (d) must equal the deduction on the return, and earlier columns cannot exceed it. Entering 0 for an earlier period is allowed and can only raise the required installment. Whether an earlier amount should be annualized is a reviewer question.
- Two self-employed spouses need separate Part II sheets and reject. A joint return must answer this explicitly.
- Page 3 of the physical form is not mapped. The review copy checks box C, fills line 10 and lists the calculated Schedule AI lines.
- The 2026 form is not final. Only the wage base changes in this calculation.

## Independent review

A separate agent reviewed the first version. Its arithmetic held: 4,000 random cases matched an independent reference, and 6,000 regular-method cases matched the parent commit byte for byte. But nothing tied the entered periods to the return, so all-zero periods erased a 1,553 penalty, and a return's own dividends could bypass the preferential-income rejection. Column (d) now reconciles to the completed return, return-level facts reject directly, Form 2210 is required whenever Schedule AI is used, the review copy recomputes every line from the source periods, and line 28 tests net earnings.

The $400 wording is loose, so a human reviewer should confirm that reading. Report: `.local/upgrade-evidence/ai-2210-da-review/report.md`.

## Checks

Column amounts were derived by hand before implementation. The four installments sum exactly to line 9, an independent check on lines 22 to 27. Penalty amounts were recomputed with exact fractions outside the engine: 977.27 regular and 744.22 annualized on the same payment. Those replace two approximate figures in the first spec draft, which were mental arithmetic. A repeating-decimal result in the first line 29 draft was also corrected by computing in twelfths.
