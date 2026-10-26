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

## Actual K-1 and EBL-source integration under review

The next isolated package binds ordinary original K-1 year, owner, EIN, statement QBI, basis history and actual simplified Form6198 records to canonical ScheduleE/8582/461 results. Current original amounts remain exact. It supports current basis and at-risk allowances, continuing passive activity with actual filed qualified vintages, and the established unique-pool positive461 method. Original SSTB qualification fixes the new suspended character; later release does not requalify earlier character. Positive prior basis/465 release, former-passive disposal and unsupported nonordinary boxes remain separate methods.

Historical excess-business-loss character has its own actual preceding-year record, recipient and activity identity, original regular NOL snapshot, original qualified fraction, opening qualified balance, and separately conserved historical absorption and attribute reductions. Only the completed current regular vintage deduction enters QBI. Modified carry absorption and current after-tax COD reductions close the qualified balance separately. Current partial mixed-character COD allocation remains an explicit method boundary; wholly qualified/nonqualified or completely eliminated balances can close directly. Ordinary172 and independent AMT origins do not become QBI. The internal AMT replay receives the completed actual regular vintage computation, not a hypothetical modified claim.

Synthetic controls include100000/80000 with60000allowed ->48000current/32000at-risk character;330000/264000 with17000EBL ->250400current/13600EBL character; and historical100000/80000 with67400regular deduction ->53920current QBI/26080qualified closing. A separate actual K-1 profit100000 plus wages100000 consumes the full100000NOL; net QBI20000 produces4000deduction. AMTI before its independent20000ATNOL is196000 after restoring the regular deduction, and finalAMTI176000. A3000capital-loss modification produces65000actual regular deduction but67400absorption; current QBI is52000, not53920.

The source-first regressions also reproduced the old omitted EBL aggregate becoming zero through schema defaults. The new optional legacy field preserves absence; explicit zero must still reconcile with actual positive sources. Current fields and prior qualified histories never override a canonical allowed loss, current claim, AGI, profit, or QBI amount.

Initial isolated checks pass59cases across10source/canonical/adjacent suites. New product modules pass root types and scoped lint with no errors; final immutable broad checks and independent review follow. No metadata or shared-source merge has occurred yet. Guided entry and source-bound review output remain the next explicit implementation steps after this calculation package, not completed by these guards.

The frozen source/canonical tree `b13c67ce33fc24d4dab35649d86cb295031dcffd` passed 842 tests across 61 files, root types, all 4,862 spec references and scoped product lint (zero errors, four existing federal non-null warnings). Independent source review refreshed Reg 1.199A-3 and Form 8995, read all 18 owned paths and passed 24 tests across five files, including five private controls for successive basis/at-risk limits, prior FIFO release, original identity/unknown facts and separate mixed-character EBL vintages. No actionable finding remained in that bounded review. Evidence is `.local/upgrade-evidence/federal-review-qbi-source-independent.log`; private probes remain outside the package.

A later source-completeness check reproduced missing 2025 partnership self-employment facts being accepted through legacy behavior. The added spec-first regression now requires exact original Box 14A, adjusted partner earnings, known farm/nonfarm classification and confirmation, and binds them to the original source snapshot. Signed source cents remain intact; an S-corporation cannot acquire partnership SE earnings. All 20 current source/canonical cases pass after this narrow guard correction. Its red/green evidence is `qbi-se-source-{red,green}.log`; refreshed IRS Schedule K-1 instructions distinguish the original Box 14A from adjusted partner earnings. The corrected immutable snapshot and bounded re-review are recorded at final integration.

## Source package final integration evidence

The corrected source guard received a separate independent review on `d3bc56221a7aa2a1c643e9476a0b2023a89b5744`. The reviewer compared the six-path delta against the earlier reviewed source package and independently passed 20 tests across four files. Actual farm/nonfarm classification, original Box 14A and adjusted earnings remain separately known and conserved; no arithmetic finding remained. Evidence: `.local/upgrade-evidence/federal-rereview-qbi-se-sources.log`.

The final rebased product tree `684d50c759f639b020f30c4f9937944840192662` on `095d5bd8d0d56202e07414f6551033b893d03c27` passed 846 tests across 62 files, root type checking, all 4,878 literal spec references and scoped product lint with zero errors and four existing federal non-null warnings. Logs are `.local/upgrade-evidence/qbi-source-final-tests.log` and `.local/upgrade-evidence/qbi-source-final-static.log`. All product/spec/test blobs in the integration match that exact tree; this evidence paragraph is the only subsequent change. Rule versions advance to 2025.93 and 2026.89-law-integration-draft while filing and year-readiness gates stay unchanged.

The source/canonical portions of remaining items 1–3 above are now implemented within their documented bounds. Actual guided K-1/history intake, derived Form 461 source classification and source-bound review presentation remain a separate follow-up. Positive mixed-origin or multiple-loss-pool Form 461 allocation, prior basis/at-risk releases, and partial mixed-character current COD attribution remain named software methods requiring their own source derivation. Agent source/software review is not professional or filing qualification.
