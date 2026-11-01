# Unsupported method register

Recorded October 31, 2026 at `298c254c`, then updated as packages shipped: Form 1099-DA basis corrections, gross-proceeds costs and repaid earlier-year unemployment, Form 2210-F, waiver requests and Schedule D worksheets with corrected digital rows, crypto payments, mining, staking, airdrop, gift and inherited lots, Schedule 1-A on Schedule AI line 14, and chapter 13 discharges are delivered. Form 1099-G business refunds moved to Ruling, because source research found no recipient rule. This classifies the engine's explicit rejections so the remaining work can be reviewed and prioritized. An unsupported return stops with a named error. The engine does not estimate it.

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
| Schedule AI with preferential income or Schedule J | `form-2210-schedule-ai.ts` | Depends on a ruling on annualizing qualified dividends and gains; Schedule J needs a period method |

## Specialist

| Family | Examples | Rejection location |
| --- | --- | --- |
| Foreign tax credit | Pass-through foreign sources, territories, overall foreign loss accounts, accrued-credit history, part-year residency | `foreign-tax-*.ts` |
| Form 172 origins | Farming, estate, cancelled-debt, other classified income and deductions | `form-172-*.ts` |
| K-1 histories | Basis, at-risk, passive recharacterization, decreased-value gifts, Form 461 classification | `k1-*.ts` |
| Charitable with loss histories | Multi-vintage attribution, prior carry with the 2026 floor, recurrent joint attribution | `charitable-*.ts` |
| COD | Chapters 7, 11 and 12 of title 11, modified-loss exhaustion, current EBL origin | `cod-nol-reductions.ts` |
| Premium tax credit | Separate-return allocation, overlapping shared policies, no-APTC allocation, below-poverty marriage | `form-8962-*.ts` |
| Education | Partial in-kind allocation, Coverdell disqualification with later activity | `form-1099-q.ts` |
| Foreign earned income | Partnership or prior non-W2 income mappings | `form-2555-source-binding.ts` |
| EIC | Active appeal, competing nonparent priority, married-child dependency | `eic-*.ts` |
| Digital assets | Multiple-state reporting, market discount, derived crypto dispositions | `form-1099-da-sources.ts` |

## Ruling

The six questions in [external actions](upgrade-2026-external-actions.md), plus the Schedule AI preferential-income question above and the final 2026 row layout for a QOF inclusion with no sale. These need a qualified reviewer or final IRS instructions. Engineering should not choose an answer.

- Canceled debt on a joint or community-property return: every married couple filing jointly with a canceled debt is rejected on the source route, so this reaches ordinary filers. Pub 4681 covers joint debt only for spouses filing separately, and neither it nor the Form 982 instructions say how to allocate insolvency or attribute reduction on a joint return. The search covered those two sources, not the regulations. A reviewer should confirm the method.
- Form 1099-G business refund: the Form 1099-G instructions define Box 8 but give the recipient no reporting rule, and the Schedule C line 6 instructions do not cover it. A reviewer should confirm the destination and tax-benefit treatment.

## How this list was made

It comes from a text search of `src/engine` and `src/models` for explicit "separate method" and "unsupported" errors, which found about 100 sites. Classes are an engineering judgment from each error and its ledger, not an individual legal analysis. Treat "appears to settle it" as a starting point, to be confirmed by each package's source research.
