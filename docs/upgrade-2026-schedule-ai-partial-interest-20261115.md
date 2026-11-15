# Actual partial investment interest, November 15

The finite 2025 single-primary Schedule AI method now accepts actual current interest above its allowable deduction. Each original Form 4952 retains the existing line 8 deduction and line 7 disallowance; together they reconcile to line 3. Current disallowance is never deducted or rolled into another period as prior-year carry. Four cumulative original costs must be nondecreasing, within the annual original and fully reconciled at year-end. Actual prior carry and other investment expenses remain explicitly zero in this method.

The [Form 4952 instructions](https://www.irs.gov/pub/irs-prior/f4952--2025.pdf) and [Form 2210 instructions](https://www.irs.gov/pub/irs-prior/i2210--2025.pdf) supply the source and annualization rules. A positive Form 4952 election requires the [Schedule D Tax Worksheet](https://www.irs.gov/pub/irs-prior/i1040sd--2025.pdf); line 44 directs the Tax Table when ordinary taxable income is below $100,000. The [final 2025 Form 1040 instructions](https://www.irs.gov/pub/irs-prior/i1040gi--2025.pdf), pages 78–80, supply the independently checked table/computation amounts.

| Actual synthetic result | Amounts in dollars |
| --- | --- |
| Allowed cumulative interest | 1,500 / 3,000 / 4,500 / 6,000 |
| Current cumulative disallowance | 3,500 / 7,000 / 10,500 / 14,000 |
| Schedule AI line 14 | 21,180 / 26,471 / 24,463 / 21,180 |
| Annual income tax / reconciliation difference | 21,180 / 0 |

The spec and genuine baseline run precede implementation: four failures and one pass show the former full-deductibility restriction. The old negative example with costs `[0,2,500,1000]`, annual cost 1,000 and period-b deduction 1 is now a coherent positive. Its replacement negative uses an actual cost contradiction of 1,001. Separate tests preserve missing originals, same-year carry rejection, stale sources, chronology, annual reconciliation, expense cents, privacy and unsupported household/year boundaries.

An initial independently calculated expected vector used Publication 505's prospective rate method. Two failed comparisons are retained. The distinct actual-return oracle uses the required Tax Table and agrees with the existing calculator and physical PDF. This was an oracle method-selection error; no tax formula, rounding utility or reconciliation tolerance was changed.

Author checks pass sixteen focused tests, root/web types, sixteen spec references and strict validation. The preceding broader run passes 217 tests with identical engine/spec/old-test bytes. A separate review passes 24 tests, including eight independent controls, three authenticated POSTs and four saved/reopened physical PDF fields. New test lint has zero warnings; the existing 58 warnings remain unchanged. The first broad run's eleven missing-pypdf failures and other setup diagnostics remain recorded separately.

| Evidence | SHA-256 |
| --- | --- |
| Final four-file source freeze | `e452910ab973f24a024f8e247e1bdf44c213e554042c9f1504b92898c5a47021` |
| Independent actual-return oracle | `7d87728ced6aae848e4a3430df40089cde076e517ab119ed1bcdcbd333bbe031` |
| Independent source/API/PDF review | `8fadcc192b54d98dfd08e4fc2c9b24019e2a799ab95a1bf2d6a86394595df0eb` |
| Root adoption review | `6b87900b09f60b515924dba0733a99ef594013debde9c5beadde160bc51e97b9` |

Private evidence is under `nov15-schedule-ai-partial-interest-test-successor`, its immutable predecessor and `nov15-schedule-ai-partial-interest-candidate-independent-review` in `.local/upgrade-evidence/`. Full combined and runtime checks follow the committed aggregate. Refund/reclassification methods, prior carry, other expenses, broader households and final 2026 output remain outside this finite packet. No independent NIIT, AMT or penalty qualification, human approval, provider call or production action is claimed.
