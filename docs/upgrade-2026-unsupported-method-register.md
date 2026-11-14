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
| Schedule AI with special-rate gains or a special tax method | `form-2210-schedule-ai.ts` | Ordinary qualified dividends and ordinary net capital gain are implemented by `656fb5f8`, with explicitly confirmed period inputs and exact full-year reconciliation. Actual signed 28% and section1250 period worksheets are implemented in `29393f5a`, with independently derived period taxes and exact full-year original-component reconciliation. The finite 2025 single-primary investment-interest election now binds four actual complete Form4952 worksheets, independently reconciled annual components and itemized deductions, with residual-first line rounding and explicit numeric source/election audits; see [sources and limits](upgrade-2026-schedule-ai-investment-election-20261114.md). Broader investment-interest carry/partial/household methods, section1202, Schedule J, Form8615 and the Form2555 foreign-earned-income/housing method retain their separate source/method gates. See [the current implementation and boundaries](upgrade-2026-form-2210-schedule-ai-work.md), [line14 spec](../spec/federal/form-2210-schedule-ai.yaml), [final2025 instructions](https://www.irs.gov/instructions/i2210) and [2026 Publication505](https://www.irs.gov/publications/p505). Final2026 Form2210 instructions, tables and qualified human review remain pending. |

## Specialist

| Family | Examples | Rejection location |
| --- | --- | --- |
| Foreign tax credit | Pass-through sources on Form 1116 or as deductions; broader guided K1 composition outside the delivered portfolio-only qualified K3 route, including separate qualified-loss, charitable and current-minimum-tax-credit original packets; territories, overall foreign loss accounts, accrued-credit history and part-year residency | `foreign-tax-*.ts`, `guided-foreign-tax-k3.ts` |
| Form 172 origins | Broader farming, unwaived/historical carrybacks, estate, other classified income and deductions. The finite actual 2025 active raised-product cash-farm current seed-loss origin with timely filed whole-period waiver is delivered; the finite personal canceled-debt source composition and separate regular/AMT current-loss originals are delivered in `58be02ed`, with guided composition in `682e902b` | `form-172-*.ts` |
| K-1 histories | Basis, foreign tax left suspended by basis (the year and amount of a later allowance are unsettled), at-risk, passive recharacterization, decreased-value gifts, remaining foreign/loss/passive-business-capital/other-business Form 461 classification | `k1-*.ts` |
| Charitable with loss histories | Partial multi-vintage attribution, prior floor with surviving excess, mixed-media and recurrent joint attribution. The same-medium fully absorbed original category is implemented in `63dccc04`; no vintage is restored or invented | `charitable-*.ts` |
| COD | Chapter 7/11 estate ownership and conversions, Chapter 12 business/farm debt, modified-loss exhaustion, current EBL origin. Original continuing-individual Chapter 12 personal borrowing and complete Chapter 12/13 history are delivered in `c00d937d`; actual retained-residence loan/basis originals and the written-arrangement exception in `f877c0fa`, with guided/current-loss composition in `997a45c8`/`682e902b` | `cod-nol-reductions.ts` |
| Premium tax credit | Broader separate-return allocation with other families, exceptions, multiple policies or absent agreements. The original one-policy Worksheet E no-exception route for two actual married-separate one-person families and one additional family is delivered; it calculates only this return's source-derived APTC and no third-family credit | `form-8962-*.ts`; [finite method](upgrade-2026-form-8962-married-third-family-20261114.md) |
| Education | Partial in-kind allocation and broader Coverdell later activity. The finite January 1 whole-account disqualification followed only by separately sourced domestic primary-beneficiary bank interest is delivered canonically in `3545a64d`; its finite guided original-source parity now has 51 focused and two actual desktop/mobile passes; broader methods remain gated | `form-1099-q.ts` |
| Foreign earned income | Broader mixed-capital allocations, partnership net loss, prior partnership services, prior non-W2 income and other mappings. The finite location-separated mixed-capital service-fee method is delivered. The finite all-foreign capital-material current service-fee loss now requires actual printed-percentage worksheets, known-zero histories and complete exclusions; broader business losses, current NOL origins/carries and new-proof PA/OH composition remain unavailable. | `form-2555-source-binding.ts`; [current-loss limits](upgrade-2026-form2555-all-foreign-capital-loss-20261114.md) |
| EIC | Broader active appeals and contested final bans. A finite timely Tax Court petition against an actual statutory notice now admits complete original records showing no assessment or finality through review. A pending boolean, missing account/court records or an assessed denial remains insufficient; no EIC amount or Form 8862 completion is inferred. | `eic-*.ts`; [unassessed-petition limits](upgrade-2026-eic-unassessed-petition-20261114.md) |
| Digital assets | Multiple-state pairs outside the admitted original PA/OH pair, PA nonresident/part-year two-state source composition, broader debt/election/history and derived crypto dispositions. Original corporate tokenized-debt full-sale market discount is delivered for federal/Ohio in `8b77d15a`, with guided intake in `6729c9a0`; direct PA secondary-market classification and independent PA basis remain open | `form-1099-da-sources.ts` |

## Ruling

The questions in [external actions](upgrade-2026-external-actions.md), including actual-year Schedule AI instruction and deduction-period treatment, plus the final 2026 row layout for a QOF inclusion with no sale. The ordinary preferential-income method described above no longer belongs to this unresolved list. A remaining special-method engineering rejection does not itself establish a ruling blocker. These remaining questions retain precise unresolved source interpretations or final-form dependencies. Further authoritative research and qualified tax review must establish a controlling treatment before implementation; no arbitrary allocation or election is inferred.

- EIC tiebreaker on a joint return or at equal AGI: IRC 152(c)(4) and Pubs 596 and 501 give the order, but none of those sources says how to compare a joint return's AGI or who wins at equal AGI. A nonparent's competing claim in those two cases rejects.
- Canceled debt on a joint or community-property return: every married couple filing jointly with a canceled debt is rejected on the source route, so this reaches ordinary filers. Pub 4681 covers joint debt only for spouses filing separately, and neither it nor the Form 982 instructions say how to allocate insolvency or attribute reduction on a joint return. The search covered those two sources, not the regulations. A reviewer should confirm the method.
- Suspended K-1 foreign tax: IRC 704(d)(3)(A) and Form 7203 line 46 limit it by basis, but no source reviewed says which year a suspended tax counts as paid when later allowed, or how the allowed part maps to Form 1116 or the election. Any basis shortfall on a K-1 with foreign tax rejects, even a small one. A reviewer should confirm whether the allowed part can be claimed in the current year.
- Below-poverty year of marriage: the alternative calculation rejects when joint household income is under 100 percent of the poverty line. Neither the Form 8962 instructions nor Pub 974 address that case, and Pub 974 Worksheet I describes no special handling of a half-income percentage below 100. A reviewer should confirm whether Part V applies.
- Form 1099-G business refund: the Form 1099-G instructions define Box 8 but give the recipient no reporting rule, and the Schedule C line 6 instructions do not cover it. A reviewer should confirm the destination and tax-benefit treatment.
- PA secondary-market corporate-debt discount: the seven-source November 14
  recheck establishes PA disposition/basis rules and express OID/imputed-interest
  rules, but does not establish the PA class or paired adjustment for federal
  §1276 discount. Positive original market discount remains rejected for PA.
  [Exact unresolved question and official bytes](upgrade-2026-pa-market-discount-20261114.md).
  Further authoritative research and a qualified PA interpretation are needed;
  general bond-sale language is not treated as the missing classification.

## How this list was made

It comes from a text search of `src/engine` and `src/models` for explicit "separate method" and "unsupported" errors, which found about 100 sites. Classes are an engineering judgment from each error and its ledger, not an individual legal analysis. Treat "appears to settle it" as a starting point, to be confirmed by each package's source research.

## November 2 source delivery

Profitable ordinary domestic ScheduleC/partnership classification with zero resulting EBL is delivered in `c6f88681`. Actual linked current ordinary NEC receipts are delivered in `ca11611b`, with complete unique originals and exact once-only gross reconciliation. The remaining classification examples above do not describe a blanket Form461 rejection. This registry records explicit boundaries; each remaining method must be assessed against the complete execution brief and completed when in scope; no blanket specialist exemption applies. Current source/CI/runtime evidence is tracked in [the active checklist](upgrade-2026-checklist.md); human, final-form and staging qualification remain separate.

## November2 C/R capability boundaries

ScheduleR published worksheet/source corrections are delivered in13a5d28e. Actual current-cash C interest/ordinary expense/address source qualification and full C replay are delivered in75f78914. Neither opens2026 exports or substitutes for human review. Shared bare PA pension/depletion/startup/IDC/bad-debt amounts are not enabled federal eligibility contracts; positive federal use rejects explicitly. The existing top-level4562 path already supports179. The concrete positively represented4562line44→C27b acquired-goodwill source bridge is delivered in97698bc0. It requires actual typed/imported current-start Section197originals; the ordinary guide has no4562origination, its4562output remains reference-only, and automatic PA composition rejects without an actual independent PA basis method. Legacy no-proof C addresses and the new source-qualified cohort must not be conflated.


## November 14 guided qualified K3 boundary

`33f8f784` delivers actual original domestic continuing non-PTP partnership portfolio K1/K3 sources in the guide for the existing §904(j) election without Form 1116. It requires matching owner, year, entity and qualified-statement/country references; complete actual portfolio amounts and annual eligibility; exact full current foreign-tax basis allowance; and explicitly zero other boxes, basis changes and prior basis/at-risk/passive suspensions. The combined existing 1099/K3 tax limit is tested before rounding. Bare K1s, unknown sources, basis shortages, mixed-source allocations and the separately listed unsupported compositions remain rejected. The distinct guided loss/basis/at-risk packet's zero-foreign-tax boundary is preserved; this delivery does not relax it.

See the [specification](../spec/federal/foreign-tax-direct-credit.yaml), [collector](../apps/web/src/lib/guided-foreign-tax-k3.ts), [independent boundary tests](../tests/guided-interview/guided-foreign-tax-k3-independent.test.ts), [final 2025 Form 1116 instructions](https://www.irs.gov/instructions/i1116) and [§904(j)](https://uscode.house.gov/us/usc/119-118/t26/s904/). The [33f8 human-review delta](upgrade-2026-human-tax-review-delta-33f8f784.md) is an unassigned source index, not a qualified decision. This finite delivery and its engineering/runtime tests do not approve final 2026 forms, filing or model promotion.
