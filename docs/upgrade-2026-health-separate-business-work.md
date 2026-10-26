# Separate-business health deduction ordering

This package extends the actual 2025 Pub974 optional method to an independently computed nonspecified health deduction from another business. It preserves each original plan, payment, business, and owner. It does not add that other business's earnings to the Marketplace-plan earnings limit.

## Controlling sources and derivation

Official sources refreshed October 26, 2026:

- [2025 Publication974](https://www.irs.gov/publications/p974), nonspecified-premium instructions, WorksheetW caution/lines4–17, WorksheetX lines5–31, ordered Y/Z worksheets and Simplified Step3.
- [Form7206 instructions](https://www.irs.gov/instructions/i7206), separate forms for each business under which a plan is established.
- [RevProc2014-41](https://www.irs.gov/irb/2014-33_IRB), sections2.04,4 and5.03.
- [Reg1.36B-4(a)(3)(iii)(C)](https://www.ecfr.gov/current/title-26/section-1.36B-4), the historical hypothetical deduction includes an allowable nonspecified deduction before the qualified-plan business's earned-income cap.
- [Reg1.162(l)-1](https://www.ecfr.gov/current/title-26/section-1.162(l)-1), specified-premium deduction and premium-credit coordination.

First complete the nonspecified deduction separately for its actual business. Each specified-plan source group already contains that business's remaining earnings after its own nonspecified claim. Therefore WorksheetW13 restores only those specified businesses' own nonspecified deductions. It does not restore the separate business's deduction or borrow its earnings. W14 is the total of all independently allowed nonspecified deductions; W15 is W13 minus W14. The published optional method can be conservative. This package does not claim to maximize the deduction under every lawful method.

The regulation's hypothetical cap was checked independently of the worksheet. Moving a separate nonspecified deduction outside that hypothetical total cap would not follow the final regulation. No such alternative is implemented here.

## Literal controls

These are derived synthetic examples, not published or human-qualified oracles.

| Actual source | Result |
| --- | --- |
| Marketplace C earnings limit4000, premiums6000, advances3600; separate F deduction2000 | W13=4000, W14=2000, W15=W16=2000, total4000; changing F's remaining earnings cannot change this limit. |
| C50000/F20000, F health3000, C premiums6000/advances3600 | SE9891, deductible half4946; X household59654, cap1625, specified maximum4025, combined7025; AGI58029, PTC1282, repayment1625. |
| C5000/F20000/W2 25000, F health3000, same C policy | Half-SE1767; C share353.4; W13=4646.6, W14=3000, W15=1646.6. Health transfer4647, AGI43586, PTC3577, repayment23, QBI deduction3717. |
| Guided primary C30000, spouse actual S-corporation W2 plan3000, no advances | Actual separate SS/Medicare rounding produces half-SE2119, W13=27881 and W15=24881. Both entered plans survive the bridge unchanged. |

Exact amounts remain Decimal throughout the source and worksheet calculations. The existing whole-dollar Schedule1 transfer remains separate. The source test also preserves cents through successive IRA and student-loan repayment-limit tests, actual zero advances, and exactly zero W15.

## Review output

The physical business forms contain only their respective nonspecified claims while the Pub974 method is active. The appendix retains the actual W13/W14/W15, separate-business source trace and final shared return transfer. Repeated combined totals are expressly nonadditive. Fresh source reconciliation checks both separate-deduction components and every retained audit row before rendering. Altered payments or retained worksheet amounts reject.

The package uses the existing guided plan, payment, W2/business and Marketplace collectors. No current claim, allocation override, fabricated business income or new source default is introduced. An entered payment edit revokes its existing confirmation.

## Evidence and boundaries

Spec-first source tests reproduced the prior blanket rejection; the exact guided case also fails against the old helper. Representation testing reproduced the missing new audit-container handoff before the narrow mapper correction. Preliminary test-only expectation corrections retained existing PDF no-comma formatting, normalized extracted text line breaks, and used the existing separately rounded ScheduleSE components. None changed a calculation or weakened numerical/privacy assertions.

Focused source, canonical, guided and saved/reopened PDF cases pass. Exact immutable checks, independent agent review and rendered artifacts will be recorded below before integration.

Still separate internal methods: positive separate-business nonspecified deductions with multiple specified-plan owners; negative W15/stop-worksheet coordination; binding historical joint repayment-cap attribution between specified-plan owners; other still-gated source combinations. This package does not turn those guards into implementations. Existing 2026 calculation and export gates remain closed. Software/source review does not establish independent human tax or filing-form qualification.
## Final bounded verification

The reviewed tree is `0696695abbb3d8f9e7a7fa35781332e39f4d0576`, rebased on `848e1fc66881a8d820adf4954677d3d0cb708fdf`. All nine executable, spec and test blobs remain identical to that tree. Final rule metadata records historical2025 provenance at2025.126 and keeps2026.123 as an incomplete law-integration draft.

- Fresh focused verification:7 tests in4 files passed. Fresh full relevant consumer cohort:561 tests in31 files passed with one worker and existing deadlines. Root and web type checks passed; all5,226 spec references resolve. Earlier identical-product lint had zero errors and22 warnings. Logs are `health-separate-business-rebased-{focused,consumers,types,web-types,spec}.log` under local upgrade evidence.
- The earlier broader run on the identical product/basebe0 archive stopped after its runner banner. After8m46s, read-only process inspection showed the runner and worker idle at0% CPU; only those processes were terminated, yielding143. Its original `health-separate-business-exact-tests.log` is retained. No passing result is claimed for that interrupted run. The fresh same31-file cohort passed in20.23s with verbose reporting as the only diagnostic runner change; assertions, worker count, deadlines and thresholds were unchanged. The cause of the idle process remains undetermined.
- Independent agent review verified all10 owned hashes in a separate clone, refreshed Pub974 and Reg1.36B-4, and passed10 tests in5 files, including three independent controls for the one-cent repayment-tier boundary, actual spouse nonspecified income limits and balanced retained-component tampering. Evidence is `ai-health-separate-business-review.log` and its review-snapshot manifest. No actionable finding remained within this scope. This is software/source review, not human tax or form qualification.
- Three exact-product reference files were saved and reopened with an independent PDF reader: C Form7206,4 pages,SHA256`1b879b0321d36fde851a463670ba16de64a0303ee5c83dea70c7abd5e2e81a3c`; F Form7206,4 pages,SHA256`2739b097cce9a63ebc012b958d61bc7a478c566bf61029e1e70140bb0e41dce0`; Form8962 reference,3 pages,SHA256`f0c9d4454fe610d0ec117d8c2eb72be9e719282045ed2d31607cca87f9ea4100`. These source files are synthetic.
- Artifact directory: `/private/tmp/tax-health-separate-business-checks-wphlla0y/.local/upgrade-evidence/health-separate-business-pdf`. `manifest.json` and `reopened-verification.json` retain all hashes, literal fields, notices and privacy checks. All11 pages and footer strips were rendered and visually inspected; full physical C/F forms, the source trace and credit summary were inspected at readable size. Physical C/F nonspecified claims remain0/3000; the return transfer4647, AGI43586, PTC3577 and repayment23 match the canonical result. Every page visibly carries its review-only notice and contains no original identifiers.

The remaining source methods listed above remain unimplemented. This delivery does not claim all Marketplace combinations or filing readiness.

The final metadata-bearing archive also passed all10 focused package and rule-pack checks in5 files. The rule-pack checks retain incomplete2026 status and independent-review/filing gates.
