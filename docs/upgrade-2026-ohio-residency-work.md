# Ohio owner residency and nonresident credit

This first package adds the 2025 IT NRC Section I worksheet and actual owner domicile/source contracts for full-year resident, part-year resident and nonresident households. It does not complete the remaining Ohio scope. Main integration, whole-guide tests and an actual browser journey remain required after independent review.

## Sources and originals

Refreshed November 2, 2026:

- [Final 2025 IT NRC](https://dam.assets.ohio.gov/image/upload/tax.ohio.gov/forms/ohio_individual/individual/2025/itnrc-fi.pdf), Section I lines 1–20; Sections II/III distinguish actual business income and apportionment. Raw SHA256 `7e2f83559370510e129a6d720e090ae08aeefffcc75083c0b91561df85639c52`.
- [Final 2025 Ohio booklet](https://dam.assets.ohio.gov/image/upload/v1767095693/tax.ohio.gov/forms/ohio_individual/individual/2025/it1040-booklet.pdf), printed pages 13, 17–18, 28, 33, 35–40 and 58–61. Actual owner domicile and receipt/service allocation; mixed-joint resident spouse includes all qualifying income in column B, including Part B. School district residence and municipal tax are separate. Raw SHA256 `931b21e7484ba96e561cf2346d8a7d2a8005bd990724b5903c9a90acede5f50e`.
- [R.C. 5747.05](https://codes.ohio.gov/ohio-revised-code/section-5747.05), effective September 30, 2025, divisions A/C/D: NRC, separate resident-period credit and credit order; no same-income double credit.
- [R.C. 5747.02](https://codes.ohio.gov/ohio-revised-code/section-5747.02), enacted 2025 and 2026 rates. This package tests only the isolated 2026 NRC allocation method; it does not enable a full 2026 Ohio return.
- [Official IT NRC forms page](https://tax.ohio.gov/individual/file-now/IT-NRC-Forms) listed 2025/2024/2023 at the checked refresh. No final 2026 NRC was observed on the checked official pages. This is a bounded availability check.

Private evidence is retained under `.local/upgrade-evidence/nov02-ohio-residency`. Independent worksheet originals were pinned in `nov02-ohio-independent-source-review/oracles-and-contract-review-before-output.json` (`0d2cb7e14a3ad263773a44ae3699b8a77ff89f2e159b69500775e29f099f3347`). The separately pinned canonical wage example is `canonical-100k-original-before-output.json` (`40edad9cdf5033d733172f4777a548b9aa0693c02d51f23ff08984d18938702d`). Neither uses candidate outputs as its oracle.

Actual synthetic example: single age 35, wages $100,000, no adjustments/credits/dependents, exemption $1,900, taxable nonbusiness income $98,100. Tax is `$342 + ($98,100 − $26,050) × .0275 = $2,323.375`, reported $2,323. With actual Virginia nonresident domicile and $20,000 Ohio-service wages, ratio `.8000`, NRC $1,858, and state income tax remaining $465. Actual Ohio allocation $40,000 instead gives NRC $1,394 and remainder $929. These are income-tax worksheet amounts before penalties, use tax, payments and final balance; no missing prior-year/payment facts are invented.

## Implementation boundary

- Every owner has explicitly sourced status and complete, unique actual-year domicile periods. Mailing address and contact-day presumptions do not supply residency.
- Section I requires actual known category amounts, including zeros; signed capital/rent and signed AGI remain signed. Nonnegative ordinary categories cannot allocate more than their full original amount.
- Line 19 truncates to four decimals before multiplying actual Schedule of Credits line 37. NRC precedes resident credit. Mixed-joint full-year resident income is included in column B.
- The initial canonical NRC cohort admits ordinary wages, bank interest and dividends whose complete current raw owner/source totals reconcile. Nonzero unqualified pension, unemployment, gambling, capital, rental, business, federal adjustment and Ohio adjustment/exclusion methods remain explicit internal successor work. Pure worksheet arithmetic is not canonical source qualification for those categories.
- A new full-year-only packet needs actual domicile timelines but no invented NRC allocation/no-business answers. Legacy resident math and legacy reference fixtures remain separate from newly source-qualified guide behavior.
- No nonzero bare NRC scalar is accepted by the adapter. A supplied scalar also cannot accompany a source-derived packet.
- The original snapshot and opaque local prepared context bind current sources and the retained federal calculation before Ohio reference output I/O. Structured person identifiers can be blanked only in the render copy. Exported source commitment is a digest; raw source references and person identifiers are not printed.
- The dedicated collector preserves blanks and explicit zero, offers actual owner/period/source controls, and invalidates confirmation after edits. Shared guide wiring belongs to the parent integration package and is not implied by component tests.
- New packets must explicitly identify school district source status. Actual taxing district or local/school withholding ambiguity requires its separate source method. W-2 locality does not prove district residence, and an unqualified amount is not silently discarded.
- The reference NRC PDF is a review summary. This package does not provide an official Ohio physical map, filing qualification, human eligibility review or staging evidence.

## Checks and retained failures

- Spec preceded tests; initial red retained two missing-module suite failures before product implementation.
- First source/core green: 37 tests. Additional ordinary-overallocation and ignored Ohio adjustment tests were red (3 failed/37 passed), then corrected.
- Collector missing-module red retained; first implementation used an unavailable `@core` alias, corrected to the existing repository alias. Its tests then passed.
- Reference red retained missing NRC attachment and ignored forged context. The corrected first positive harness accidentally selected IT1040 because its directory contained `nrc`; that selector failure remains retained. The selector now requires exact `oh-it-nrc-reference.pdf` basename.
- Fullresident local/district omission and contradictory claimed adjustment originals were independently retained red (2 failed/13 passed) before source guards were corrected.
- Focused package: 54 tests across 5 files passed. Existing Ohio engine/PDF plus new tests: 792 tests across 29 files passed. Root, web and contracts typechecks passed. The first root typecheck had one invalid property reference; it was corrected and its failure retained.
- Production guard and presentation cleanup followed these results. Independently pinned all20line worksheet original `bdf011111094e39102840f4825856ad96ec133c5dc4c7a21a9dfbcc9b5022813` was added before its first output, using actualaddition7 reimbursement anddeduction19 IDA contributions. The initial draft had mislabeled the addition13 (actually BID deduction); that source erratum and original monetary array were retained before output. Further spec-linked reds retained 13 failures/57 passes before correction: actual depreciation addition9 versus allowed nonqualified529 addition4, unknown addition13, unqualified RC claims on fullresident packets, reciprocal-state wage methods, private SSN-only source changes and grouped displayed amounts. These corrected controls passed; the explicit fullAmount state-adjustment source shape had its own retained red before correction. Earlier green results alone do not certify subsequent bytes.

## Durable remaining checklist

- [x] Final author checks: 71 focused tests/5 files, 809 affected tests/29 files, all three typechecks, 6539 spec entries with no broken/missing references, 557 strict reference checks, scoped lint zero errors/79 warnings (retained existing and test assertions).
- [ ] Independent source/artifact review of the immutable first package.
- [ ] Parent applies exact shared model/draft hunks and actual guide validation, source invalidation, preview and review-download wiring. Preflight Ohio sources before whole-packet output work. Actual desktop/mobile save/edit/reconfirm/reopen/download journey.
- [ ] Expand current canonical Section I original classifications and Ohio adjustment exclusions, preserving actual owner/receipt sources and signed losses.
- [ ] NRC Sections II/III actual business attribution/apportionment, depreciation, BID and mixed-joint resident spouse treatment; not inferred from federal business labels or overridden credits.
- [ ] Source-bound resident-period other-state credit linkage and no same-income double credit. Separate printed IT RC aggregate/truncated-ratio correction is parent-owned.
- [ ] Actual school district resident-period traditional/earned sources, explicit fallback conditions, legitimate withholding/refund handling and municipal boundary disclosure.
- [ ] Enacted 2026 full Ohio integration and final-source/form qualification; isolated method tests do not enable a year pack.
- [ ] Official physical forms/qualified exports and review gates remain separately tracked by the parent.

## Final author freeze

The private source freezes after final validation. The first final validator found 21 malformed file-only spec references; those links now name actual literal tests. A separate strict-reference invocation named a nonexistent file; that prerequisite error is retained, followed by the existing strict-reference suite passing 557 tests. No validator, threshold or old test assertion was weakened. Final exact commands, exit codes, logs and hashes are in the immutable manifest and `final-check-status.json` / `final-validation-attempt2.json`.

All packets now bind an exact current original snapshot privately, including full-year resident-only packets. Identifier normalization is limited to permitted rendered-copy comparison; the digest-only current-original commitment binds exact private identifiers; an equal-money private SSN change requires current confirmation. State addition originals use `fullAmount`, distinct from federal income amounts. Reciprocal-state Ohio compensation remains rejected pending its actual exemption method. New full-year packets also reject unqualified other-state credits and district/local source ambiguity. The dedicated collector accepts valid displayed grouping losslessly and actual signed capital/rental/other amounts; blank remains unknown.

First-package author checks do not establish all-three-residency launch completion. Shared whole-guide wiring, independent review, actual browser lifecycle, additional Section I methods, business Sections II/III, source-qualified resident credits and district returns, enacted2026 integration, official physical forms and human/source/filing gates remain open as listed above. State algorithm/source revision metadata must be bound separately from the unchanged federal rule-pack versions in the final state integration successor.

## V2 independent source-binding correction

Independent review retained11 passes/1 genuine failure against frozen V1: changing an actual private SSN and its matching current source snapshot left the published source commitment unchanged because its final hashing input was identifier-normalized. The private stale-snapshot guard already rejected unmatched originals; this was a distinct commitment collision, not a demonstrated stale saved-Ohio-result bypass.

A separate V2 copy preserved all V1 bytes and evidence. Spec and own regression preceded a real1-failure/26-skipped red. The narrow product change hashes the exact actual private original packet/facts and emits only its digest. Existing opaque current-original resolution and permitted redacted-copy comparisons remain intact. Tax amounts are unchanged. All72 focused tests/5 files, three typechecks,6539 spec entries,557 strict references and scoped lint pass. No validator, original oracle, privacy redaction or readiness gate changed. Independent corrected source/artifact review and shared whole-guide integration remain pending.


## Parent reviewed first source package

Independent V2 probes pass all 12 unchanged originals, closing the retained V1
identity-commitment collision. Three saved redacted reference PDFs across nine
pages reopen with the exact NRC 1,858 and remaining income tax 465, without raw
SSNs, private references or widget annotations. This is reference-workbook
engineering evidence, not a complete-return or human-review qualification.

Main checks pass 815 tests in 30 affected files, all three types, 6,553 spec links,
616 inventory entries, scoped lint (zero errors, 79 warnings) and engine
build. Parent review corrected one newly added file-only business-rule reference
to the exact unchanged parameterized negative test title. The strict suite passes
557 references, and regenerated inventory freshness passes. No product, test
assertion or readiness gate changed for that reference correction.

Shared interview/preview/download wiring remains a separate private successor.
It has real failing-to-passing source tests, but has not yet been adopted or
qualified as a full payment/balance method. Actual prior-return, dated payment,
penalty, resident-credit, business, reciprocity, district and final-form sources
remain required internal implementation. Source algorithm revision metadata is
also still required independently of the federal rule pack.
