# Form 2210 Schedule AI

The annualized income method was rejected. It lowers or removes the penalty for taxpayers whose income arrives late in the year, so the regular method overstated their penalty. This package calculates Schedule AI for calendar-year individuals.

## Rule

Form 2210 (2025) page 3 fixes the multipliers (4, 2.4, 1.5, 1), applicable percentages (22.5, 45, 67.5, 90), Part II factors and line order. Line 29 prorates the wage base by 3, 5, 8 and 12 twelfths; the 2025 printed limits are the check. Line 27 replaces one-fourth of line 9 as Part III line 10, and the existing dated penalty runs unchanged.

## Limits

- The instructions do not say whether the line 14 worksheet's qualified dividends and net capital gain are annualized. A positive amount rejects instead of choosing a convention.
- Lines 9, 16 and 18 are actual entered amounts because each depends on its own period worksheet.
- Two self-employed spouses need separate Part II sheets and reject. A joint return must answer this explicitly.
- Page 3 of the physical form is not mapped. The review copy checks box C, fills line 10 and lists the calculated Schedule AI lines.
- The 2026 form is not final. Only the wage base changes in this calculation.

## Independent review

A separate agent reviewed the first version. Its arithmetic held: 4,000 random cases matched an independent reference, and 6,000 regular-method cases matched the parent commit byte for byte. But nothing tied the entered periods to the return, so all-zero periods erased a 1,553 penalty, and a return's own dividends could bypass the preferential-income rejection. Column (d) now reconciles to the completed return, return-level facts reject directly, Form 2210 is required whenever Schedule AI is used, the review copy recomputes every line from the source periods, and line 28 tests net earnings.

The $400 wording is loose, so a human reviewer should confirm that reading. Report: `.local/upgrade-evidence/ai-2210-da-review/report.md`.

## Checks

Column amounts were derived by hand before implementation. The four installments sum exactly to line 9, an independent check on lines 22 to 27. Penalty amounts were recomputed with exact fractions outside the engine: 977.27 regular and 744.22 annualized on the same payment. Those replace two approximate figures in the first spec draft, which were mental arithmetic. A repeating-decimal result in the first line 29 draft was also corrected by computing in twelfths.
