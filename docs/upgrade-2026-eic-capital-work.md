# EIC investment capital component

This package corrects Publication 596 Worksheet 1 lines 5–7. The canonical
return previously included all positive Form 1040 capital gain in investment
income. A nonpassive business-property gain of $12,000 with $2,000 wages
incorrectly denied the credit. Removing the calculated Form 4797 line 9 amount
restores the published 2025 table credit of $155 for the synthetic case.

The [official 2025 Publication 596](https://www.irs.gov/publications/p596),
Rule 6 and Worksheet 1, was checked on 2026-10-26. The calculation uses Form 4797
line 9 after the prior-loss lookback, which equals positive line 7 when the
lookback is zero. It preserves separate investment gains and floors both the
starting net gain and the resulting investment component at zero. Three audit
entries expose those amounts. Monetary arithmetic remains Decimal.

Spec entries preceded five regression cases. The original implementation fails
all five: one demonstrates the wrong credit and four lack the required worksheet
trace. After correction, 95 tests in five files pass. An expanded adjacent run
passes 190 tests in nine files; root types, 5,095 spec references and scoped lint
pass, with zero lint errors and four existing warnings. The first scoped command
included a nonexistent schedule path; the expanded run uses the actual form path.

Evidence is retained in `.local/upgrade-evidence/eic-capital-red.log`,
`eic-capital-green.log`, `eic-capital-adjacent.log` and `eic-capital-static.log`.
The work starts from `817f76f`. Review and integration references will be added
before commit. This package does not complete other investment-income components,
qualify aggregate legacy overrides or establish final 2026 filing readiness.

Independent agent review of frozen `80493e9e` verified all four owned hashes,
refreshed Publication 596 and Form 4797 instructions, and passed 43 tests in
three files. Four private controls cover actual property recapture and partial
lookback, offsetting property loss, short holding periods and preserved explicit
legacy overrides. No scoped finding remained. Review log
`.local/upgrade-evidence/ai-eic-capital-review.log` has SHA256
`01077f89440d4cea4f5459c4a1f34270bd45b6b7b911e5f0ab46c1b858bdabc9`.
Integration starts from `6271a96`; the reviewed federal delta and new spec/test
blobs are unchanged, with the separately committed Rule 3 handoff preserved.
An initial whole-file equality check correctly detected those intervening Rule 3
changes; comparison of the scoped delta passes. Final integration passes 199
tests in ten files, root types and 5,112 references, recorded in
`.local/upgrade-evidence/eic-capital-integration.log`. Metadata advances to
`2025.116` / `2026.113-law-integration-draft`. This is agent review, not the
required independent human tax qualification.
