# Unsupported method register

Recorded October 31, 2026 at `298c254c`, then updated as packages shipped: Form 1099-DA basis corrections, gross-proceeds costs and repaid earlier-year unemployment are delivered. This classifies the engine's explicit rejections so the remaining work can be reviewed and prioritized. An unsupported return stops with a named error. The engine does not estimate it.

A rejection here is not an external blocker unless its class says so. Year guards are excluded: they reject unsupported years on purpose and are not missing work.

## Classes

| Class | Meaning | Who can move it |
| --- | --- | --- |
| Ordinary | A filer without unusual history can reach it, and official sources appear to settle it | Engineering |
| Specialist | Determinate, but it needs an unusual combination of sources | Engineering, after the ordinary class |
| Ruling | The authority leaves a real choice | A qualified tax reviewer |

## Ordinary, in priority order

| Method | Rejection location | Who it affects |
| --- | --- | --- |
| Form 2210 farmer or fisher rule, and waiver | `form-2210.ts` | Farmers, fishers and filers requesting relief |
| Form 1099-G business state refund | `form-1099-g.ts` | Business owners with a business tax refund |
| Schedule AI with preferential income | `form-2210-schedule-ai.ts` | Depends on a ruling on annualizing qualified dividends and gains |

## Specialist

| Family | Examples | Rejection location |
| --- | --- | --- |
| Foreign tax credit | Pass-through foreign sources, territories, overall foreign loss accounts, accrued-credit history, part-year residency | `foreign-tax-*.ts` |
| Form 172 origins | Farming, estate, cancelled-debt, other classified income and deductions | `form-172-*.ts` |
| K-1 histories | Basis, at-risk, passive recharacterization, decreased-value gifts, Form 461 classification | `k1-*.ts` |
| Charitable with loss histories | Multi-vintage attribution, prior carry with the 2026 floor, recurrent joint attribution | `charitable-*.ts` |
| COD | Title 11, joint or community ownership, modified-loss exhaustion, current EBL origin | `cod-nol-reductions.ts` |
| Premium tax credit | Separate-return allocation, overlapping shared policies, no-APTC allocation, below-poverty marriage | `form-8962-*.ts` |
| Education | Partial in-kind allocation, Coverdell disqualification with later activity | `form-1099-q.ts` |
| Foreign earned income | Partnership or prior non-W2 income mappings | `form-2555-source-binding.ts` |
| EIC | Active appeal, competing nonparent priority, married-child dependency | `eic-*.ts` |
| Digital assets | Multiple-state reporting, special dispositions, market discount, derived crypto dispositions | `form-1099-da-sources.ts` |

## Ruling

The six questions in [external actions](upgrade-2026-external-actions.md), plus the Schedule AI preferential-income question above and the final 2026 row layout for a QOF inclusion with no sale. These need a qualified reviewer or final IRS instructions. Engineering should not choose an answer.

## How this list was made

It comes from a text search of `src/engine` and `src/models` for explicit "separate method" and "unsupported" errors, which found about 100 sites. Classes are an engineering judgment from each error and its ledger, not an individual legal analysis. Treat "appears to settle it" as a starting point, to be confirmed by each package's source research.
