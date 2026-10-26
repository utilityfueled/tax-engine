# Shared Marketplace health sources

This package joins an actual Situation4 two-family agreement to independently recorded self-employed health payments. It keeps the complete original policy, other-family cash and advances, and covered-person identities. It derives this return's premium and advances before the existing Pub974 calculation. The agreement never supplies a missing payment or qualifying relationship.

## Sources and bounded method

Official sources refreshed October26,2026:

- [Final2025 Pub974, Specified Premiums and WorksheetsW/X](https://www.irs.gov/publications/p974): allocate a shared policy between tax families first, then determine the specified coverage-family portion. W1 and W2 use the resulting specified premiums and attributable advances.
- [Form7206 instructions](https://www.irs.gov/instructions/i7206) and [IRC162(l)](https://uscode.house.gov/view.xhtml?req=granuleid:USC-prelim-title26-section162&num=0&edition=prelim): preserve the actual person, paid amount, business establishment and earnings requirements.
- [Final2025 Form8962 instructions](https://www.irs.gov/instructions/i8962): Situation4 agreement, monthly allocation, actual poverty percentage and Table2 contribution rates.
- [Reg1.162(l)-1](https://www.ecfr.gov/current/title-26/section-1.162(l)-1) and [RevProc2014-41](https://www.irs.gov/irb/2014-33_IRB): the existing premium-credit/health coordination remains the calculated method.

The initial source method requires one actual owner/business across its linked shared health plans, an actual Situation4 agreement, complete original covered-person links and actual this-return coverage-family membership. Every monthly full receipt conserves owner cash plus other-person cash plus full advances. Its person records separately conserve owner cash and advances. This return's actual person advances must equal allocated advances, and its actual cash plus those advances must equal the allocated premium. Outside-person owner cash is explicitly zero. The binder rejects missing, contradictory or duplicate source identities, changed original snapshots, unknown payments, unsupported tax-free funding and unreconciled months. No raw amount is rewritten to make those checks pass.

The pure policy allocator now accepts a known health-coordination answer because allocation precedes health validation. It still rejects an unknown answer. The final credit calculator still requires its completed internal health context. Three existing source-boundary tests were updated to test that distinction; an incomplete canonical health claim still rejects.

## Derived controls

These are synthetic statutory/worksheet controls, not published examples or human-qualified tax results.

| Actual records | Calculated result |
| --- | --- |
| Full monthly premium1000, advance600, agreement0.50; independently recorded owner cash200, other cash200 and each person's advance300 | Own premium500/advance300; full annual12000/7200 and actual owner cash2400 remain unchanged. |
| 2025 ScheduleC profit50000 with those records | Half-SE3533; W16=2400, X25=975, maximum3375. Step2 MAGI43092, FPL286%, rate0.0544, monthly contribution195 and PTC3660; health2340. FinalAGI44127 gives actual293.0079% FPL, row293 rate0.0572, monthly210, finalPTC3480 and repayment120. Health reduces QBI once. |
| Actual profit1000000 | Health6000, finalPTC0 and allocated repayment3600; full outside-family records remain unchanged. |
| Actual January full1000.02/advance600.02 | Exact own500.01/300.01 before reporting; source order and known-zero/full agreements retain conservation. |
| Isolated2026 actual shared sources versus separately supplied own-family sources | Same calculated deduction/AGI/PTC when both use actual monthly reporting, including January500.01 versus full1000.02. Production2026 remains closed. |

The initial hand calculation used the wrong final FPL table row; direct division establishes293%, not292%. Correcting that independent expectation changed no calculation. The first2026 test correctly encountered the production gate; the isolated calculation uses the repository's established constants mock. An initial annual-versus-monthly comparison was not a valid invariant, so both actual controls now contain the same January cents requiring monthly reporting. Those failed logs are retained.

## Actual intake and review output

The guide collects source year/reference, explicit coverage answers, original-person identifiers and person links without defaults. It retains false, zero, arbitrary Decimal precision and unknown blanks. Substantive edits revoke the outer health confirmation, nested links and existing related Marketplace confirmations. Confirmation-only edits cannot create facts.

The production browser exposed a real route defect: after a health edit, Adjustments could not advance to the later Marketplace controls needed for reconfirmation. A spec-linked full-shell test reproduced the missing controls before the fix. The same saved Marketplace panel is now also reachable beside Marketplace health plans, in the existing panel-stack layout. Validation is unchanged, and there is no duplicate source model or automatic confirmation. Both desktop and mobile flows now edit, independently reconfirm, reload and preserve unknown source values with the original numeric/privacy assertions.

Form7206 source reconciliation receives the existing opaque original PTC token before identifiers are redacted. Only validation reads that private original; rendering uses redacted inputs. Whole-input/calculation binding and the existing independent health audit check reject forged, missing or stale tokens and altered calculated deductions before template I/O. The physical Form7206 remains the nonspecified form; its appendix shows full originals, separately derived allocation, Pub974 trace and the actual Schedule1 transfer. Form8962 prints the final monthly allocation/credit/repayment. Real workspace export is covered.

## Author evidence

- Spec-first core, guide and PDF failures are retained under local `shared-health-*-red*.log`; the final full-shell missing-confirmation failure is `shared-health-reachability-red-final.log`.
- Relevant one-worker cohort:948 tests in53 files pass, including strict spec references, full workspace-export file and existing monthly/owner/marriage/allocation consumers. `shared-health-broad-final-tests.log` records the final result. The earlier947/948 run retained one obsolete pure-allocation rejection; it now also verifies canonical rejection without completed health sources.
- Root and web types pass; all5304 spec references resolve. Final scoped lint has0 errors and411 warnings, chiefly existing and fixture non-null assertions. Production build passes. A concurrent build/typecheck attempt temporarily removed generated `.next` files; the web typecheck was rerun after the build and passes. That failed invocation remains recorded.
- Production browser:2/2 desktop1280/mobile390 cases, zero retries. Both screenshots were inspected; no horizontal overflow. Server3241 was stopped after checks. Early browser failures from incomplete synthetic blank credit sections and a mistaken nonexistent deduction-confirmation locator are retained separately from the confirmed route regression.
- Six synthetic PDFs were saved and reopened with an independent reader: ordinary/no-credit physical7206, physical8962 and8962reference. The manifest records34 pages and12 exact physical field checks, literal health/PTC/repayment assertions, every-page notices and absent taxpayer identifiers. All34 rendered pages and their footer strips were inspected; full source/health trace and both physical credit pages were inspected at readable size. Artifacts and SHA256 values are in `/private/tmp/tax-shared-health-work-hakocm1s/.local/upgrade-evidence/shared-health-artifacts/manifest.json`.

Independent source/software review is clear on immutable9a2519d: all32 owned hashes verified before and after,55 tests in11 files including four private controls for exact quarter/zero allocation, once-only QBI, split/reordered payments, missing/duplicate persons and stale original context before I/O. The reviewer independently reopened all six PDFs/34 pages, verified fields/privacy/notices and visually inspected the footer crops plus source/trace pages. Evidence is `ai-shared-health-review.json` and `ai-shared-health-pdf-review.json`. This remains agent review and does not establish human tax-law or filing-form qualification.

Final integration is rebased on60611f3 with the same reviewed source changes. The only upstream differences in owned files are retained royalty validation, ScheduleE original-context dispatch and its existing workspace test. Metadata2025.130/2026.127 records this bounded method without opening2026 or filing qualification. Final fresh checks:516 tests in11 files pass, including all new source/canonical/guide/PDF cases, full workspace output and strict reference checks. Root/web types and all5338 spec references pass; scoped lint and diff checks pass. The earlier948/53, production build/browser2/2 and independently reviewed saved artifacts remain the wider evidence.

## Remaining methods

This is a finite bounded source path, not all Marketplace combinations. Still unimplemented are shared-health no-agreement/default and Situation3 methods; actual outside-tax-family eligible children or owner-paid outside persons; partial coverage-family specified-premium allocation; multiple specified-plan owners with shared policies; shared-policy marriage or other distinct coordination combinations. Previously named binding2025 joint repayment attribution, multiple-owner/separate-business nonspecified coordination and negative-W15/stop-worksheet coordination also remain separate. Source intake, formula and output must be completed and reviewed before those guards can be removed. Neither a guard nor an agent review marks them implemented. Existing2026 and filing gates remain closed.
