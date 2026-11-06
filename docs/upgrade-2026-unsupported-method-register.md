# Unsupported method register

Recorded October 31, 2026 at `298c254c`, then updated as packages shipped: Form 1099-DA basis corrections, gross-proceeds costs and repaid earlier-year unemployment, Form 2210-F, waiver requests and Schedule D worksheets with corrected digital rows, crypto payments, mining, staking, airdrop, gift and inherited lots, Schedule 1-A on Schedule AI line 14, chapter 13 discharges, married-child and nonparent EIC tie-breakers on the actual child-source routes, active-partner foreign earned income, foreign profit removed from QBI, pass-through foreign tax on the election without Form 1116, K-1 foreign tax in the basis schedule, and separate-return premium tax credit allocation are delivered. Form 1099-G business refunds moved to Ruling, because source research found no recipient rule. This classifies the engine's explicit rejections so the remaining work can be reviewed and prioritized. An unsupported return stops with a named error. The engine does not estimate it.

A rejection here is not an external blocker unless its class says so. Year guards are excluded: they reject unsupported years on purpose and are not missing work.

## Classes

| Class | Meaning | Who can move it |
| --- | --- | --- |
| Ordinary | A filer without unusual history can reach it, and official sources appear to settle it | Engineering |
| Specialist | Determinate, but it needs an unusual combination of sources | Engineering, after the ordinary class |
| Ruling | Reviewed sources leave a precise unresolved interpretation | Further authoritative research and qualified tax review |

## Ordinary, in priority order

| Method | Rejection location | Who it affects |
| --- | --- | --- |
| Schedule AI with preferential income or Schedule J | `form-2210-schedule-ai.ts` | Depends on a ruling on annualizing qualified dividends and gains; Schedule J needs a period method |

## Specialist

| Family | Examples | Rejection location |
| --- | --- | --- |
| Foreign tax credit | Pass-through sources on Form 1116 or as deductions, pass-through tax in the guide (guided K-1 basis and at-risk sources require zero foreign tax), territories, overall foreign loss accounts, accrued-credit history, part-year residency | `foreign-tax-*.ts` |
| Form 172 origins | Farming, estate, cancelled-debt, other classified income and deductions | `form-172-*.ts` |
| K-1 histories | Basis, foreign tax left suspended by basis (the year and amount of a later allowance are unsettled), at-risk, passive recharacterization, decreased-value gifts, remaining foreign/loss/passive-business-capital/other-business Form 461 classification | `k1-*.ts` |
| Charitable with loss histories | Multi-vintage attribution, prior carry with the 2026 floor, recurrent joint attribution | `charitable-*.ts` |
| COD | Chapters 7, 11 and 12 of title 11, modified-loss exhaustion, current EBL origin | `cod-nol-reductions.ts` |
| Premium tax credit | Separate-return allocation with a third tax family | `form-8962-*.ts` |
| Education | Partial in-kind allocation, Coverdell disqualification with later activity | `form-1099-q.ts` |
| Foreign earned income | Mixed U.S. and foreign Schedule C income where capital is a material factor, business or partnership net loss, prior partnership services, prior non-W2 income, other mappings | `form-2555-source-binding.ts` |
| EIC | Active appeal | `eic-*.ts` |
| Digital assets | Multiple-state pairs outside the admitted original PA/OH pair, PA nonresident/part-year two-state source composition, market discount (tokenized debt, needs interest plumbing through state engines), derived crypto dispositions | `form-1099-da-sources.ts` |

## Ruling

The six questions in [external actions](upgrade-2026-external-actions.md), plus the Schedule AI preferential-income question above and the final 2026 row layout for a QOF inclusion with no sale. These retain precise unresolved source interpretations or final-form dependencies. Further authoritative research and qualified tax review must establish a controlling treatment before implementation; no arbitrary allocation or election is inferred.

- EIC tiebreaker on a joint return or at equal AGI: IRC 152(c)(4) and Pubs 596 and 501 give the order, but none of those sources says how to compare a joint return's AGI or who wins at equal AGI. A nonparent's competing claim in those two cases rejects.
- Canceled debt on a joint or community-property return: every married couple filing jointly with a canceled debt is rejected on the source route, so this reaches ordinary filers. Pub 4681 covers joint debt only for spouses filing separately, and neither it nor the Form 982 instructions say how to allocate insolvency or attribute reduction on a joint return. The search covered those two sources, not the regulations. A reviewer should confirm the method.
- Suspended K-1 foreign tax: IRC 704(d)(3)(A) and Form 7203 line 46 limit it by basis, but no source reviewed says which year a suspended tax counts as paid when later allowed, or how the allowed part maps to Form 1116 or the election. Any basis shortfall on a K-1 with foreign tax rejects, even a small one. A reviewer should confirm whether the allowed part can be claimed in the current year.
- Below-poverty year of marriage: the alternative calculation rejects when joint household income is under 100 percent of the poverty line. Neither the Form 8962 instructions nor Pub 974 address that case, and Pub 974 Worksheet I describes no special handling of a half-income percentage below 100. A reviewer should confirm whether Part V applies.
- Form 1099-G business refund: the Form 1099-G instructions define Box 8 but give the recipient no reporting rule, and the Schedule C line 6 instructions do not cover it. A reviewer should confirm the destination and tax-benefit treatment.

## How this list was made

It comes from a text search of `src/engine` and `src/models` for explicit "separate method" and "unsupported" errors, which found about 100 sites. Classes are an engineering judgment from each error and its ledger, not an individual legal analysis. Treat "appears to settle it" as a starting point, to be confirmed by each package's source research.

## November 2 source delivery

Profitable ordinary domestic ScheduleC/partnership classification with zero resulting EBL is delivered in `c6f88681`. Actual linked current ordinary NEC receipts are delivered in `ca11611b`, with complete unique originals and exact once-only gross reconciliation. The remaining classification examples above do not describe a blanket Form461 rejection. This registry records explicit boundaries; each remaining method must be assessed against the complete execution brief and completed when in scope; no blanket specialist exemption applies. Current source/CI/runtime evidence is tracked in [the active checklist](upgrade-2026-checklist.md); human, final-form and staging qualification remain separate.

## November2 C/R capability boundaries

ScheduleR published worksheet/source corrections are delivered in13a5d28e. Actual current-cash C interest/ordinary expense/address source qualification and full C replay are delivered in75f78914. Neither opens2026 exports or substitutes for human review. Shared bare PA pension/depletion/startup/IDC/bad-debt amounts are not enabled federal eligibility contracts; positive federal use rejects explicitly. The existing top-level4562 path already supports179. The concrete positively represented4562line44→C27b acquired-goodwill source bridge is delivered in97698bc0. It requires actual typed/imported current-start Section197originals; the ordinary guide has no4562origination, its4562output remains reference-only, and automatic PA composition rejects without an actual independent PA basis method. Legacy no-proof C addresses and the new source-qualified cohort must not be conflated.
