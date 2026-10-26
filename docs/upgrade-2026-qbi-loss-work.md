# Actual suspended QBI loss character

## Scope and source evidence

Research refreshed October 25, 2026 against [T.D.9899](https://www.irs.gov/irb/2020-29_IRB), [Reg1.199A-3](https://www.ecfr.gov/current/title-26/section-1.199A-3), [Form8995 instructions](https://www.irs.gov/instructions/i8995), and [Form461 instructions](https://www.irs.gov/instructions/i461). The regulatory example's100000 total loss,80000 otherwise-qualified loss and60000 allowance yield48000 current negative QBI and32000 suspended qualified loss.

The initial prerequisite calculates one actual activity's loss character at one suspending Code provision. It keeps actual filed original/remaining qualified and nonqualified balances, uses prior vintages FIFO, and separates current-year negative QBI from released prior qualified loss. It retains explicit unknown participation when relevant to the2026 minimum. Current source cents remain exact through the fraction; the.51 total/.49 qualified control opens a filed1 total/0 qualified carry rather than inventing a qualified dollar.

A second pure helper accepts calculated Form461 and a complete calculated business loss context. Positive disallowance must reconcile with lines14–16 and the unique identified loss pool. It supports current loss only or one released prior vintage only. Current qualified loss is recomputed from the final allowance and its exact source fraction; the new461 qualified carry conserves the preceding printed qualified allowance. For a released prior vintage, columnD/row3 removes its proportionate qualified re-suspension once from row4 and opens a separate current-year461 character ledger.

These are internal calculation prerequisites. No new root input, source collector, federal caller, filing qualification or year-readiness gate is enabled by these files. Their calculated allowances and loss pools are engine contexts, not taxpayer overrides. Ordinary and AMT NOL amounts remain the responsibility of the existing independent canonical computations.

## Validation

- Spec entries preceded the missing-module red tests.
- The original fractional-carry implementation independently failed the.51/.49 control; the exact-source correction passes.
- Eleven new source/re-suspension cases plus eight adjacent rental cases pass,19 total. Root types passed for the first helper; final combined checks are recorded separately before commit.
- The literal IRS example is distinguished from synthetic current-year controls. The333000 loss/313000 statutory threshold control derives20000 EBL through the real Form461 calculator, then verifies250400 currently allowed qualified loss and16000 new qualified EBL.
- Software/source review is separate from professional or filing qualification.

## Remaining integration work

1. Bind actual ordinary non-PTP K-1 source identity/year/owner/statement facts and actual basis/at-risk evidence; derive passive allowances from canonical8582 and bind actual filed histories.
2. Apply the supported unique-pool post-EBL calculation to current/prior source results and retain separate QBI character carries alongside canonical regular/AMT NOL carries.
3. Bind actual prior EBL origin character to the regular NOL deduction used in the current year; no generic172 NOL becomes QBI.
4. Collect these actual sources in the guide, invalidate stale confirmations, retain save/reload/privacy behavior, and produce source-bound review records.
5. Establish a controlling method before enabling positive EBL across multiple loss pools, mixed current/prior portions, or multiple released origin vintages. QBI FIFO alone does not establish the new461 allocation; neither user-entered current allocation amounts nor a completed worksheet substitute for that calculation.

## Exact prerequisite review and checks

The frozen product tree `dfaab9e896ad2d49f33059eb7ee903b5918af62c` passed 262 tests across nine files, root type checking, all 4,795 spec references and scoped lint with no errors or warnings. These checks cover the new helpers and adjacent rental, basis, at-risk, passive and excess-business-loss calculations; they do not establish the remaining canonical integrations.

A separate agent refreshed the regulation and Form 8995 instructions, reviewed the original and released loss amounts, fixed prior ratios, FIFO and unique-pool boundary, and independently passed 14 cases (11 package cases and three private probes). The extra probes covered reordered pre-2018/current histories, wholly nonqualified prior re-suspension and exact 0.51/0.49 opening-source rounding. No actionable finding remained in that bounded review. Evidence: `.local/upgrade-evidence/qbi-loss-character-exact-tests.log` and `.local/upgrade-evidence/federal-review-qbi-character.log`. The private probes are not part of this package.
