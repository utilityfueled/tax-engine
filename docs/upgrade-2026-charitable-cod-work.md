# Positive charitable benefit, COD and separate modified absorption

Private source research, 2026-10-27. Base `805cbac9fc5c807d57b5d7ceec4d70f1bdd3f111`; no main/index changes. This note records a proposed bounded implementation, not completed software, a published IRS numerical example, or independent tax-law qualification.

## Authorities read

- [IRC108(b)(2)(A), (b)(3), (b)(4)](https://uscode.house.gov/us/usc/119-118/t26/s108/): current loss and carryover **to** the discharge year; dollar-for-dollar attribute reduction after current tax; current loss precedes older losses.
- [Reg1.108-7(b), (e) Examples1–2](https://www.govinfo.gov/content/pkg/CFR-2025-title26-vol2/pdf/CFR-2025-title26-vol2-sec1-108-7.pdf): take carryover/carryback into account in the relevant tax year before attribute reduction. The examples have no individual modified-income/charitable difference; they do not themselves answer that interaction.
- [Pub4681, All other tax attributes, item1](https://www.irs.gov/publications/p4681): current loss first, then carryover to2025 after current taxable-income use, oldest first.
- [IRC172(b)(2)](https://uscode.house.gov/us/usc/119-118/t26/s172/) and [Reg1.172-5(a)(2)](https://www.ecfr.gov/current/title-26/section-1.172-5): the outgoing loss is separately measured using modified income. Original current deductions are not a substitute for that absorption.
- [IRC170(d)(1)(B)](https://uscode.house.gov/us/usc/119-118/t26/s170/), [Reg1.170A-10(d)(1)](https://www.ecfr.gov/current/title-26/section-1.170A-10), and [Form172 instructions, line26](https://www.irs.gov/instructions/i172): remove charitable excess only to the extent it reduces modified taxable income and increases a succeeding NOL. Preserve the original source/year/category and existing unique-excess method.
- [Reg1.55-1](https://www.ecfr.gov/current/title-26/section-1.55-1) and [IRC56(d)](https://uscode.house.gov/us/usc/119-118/t26/s56/) supply the already-enabled separate AMT ledger; neither opening nor claim is inferred equal to regular.

## Defined quantities and finite first cohort

For each actual old loss, keep opening available `B`, current taxable-income use `U`, normal modified absorption `A`, comparison modified absorption `Ac`, and COD reduction `R` separate. The existing current-tax claim remains unchanged. The existing108 waterfall is determined from current-year loss first and each old `B-U`; it is not recomputed from a hypothetical charitable current deduction. Current-year expiry and amounts already expired before the year remain separate.

The first proposed composition requires the same determined108 reduction vector to fit both existing modified-loss vectors before expiry: `R <= B-A` and `R <= B-Ac` for every reduced original. Then the outgoing amounts are `(B-A)-R` and `(B-Ac)-R`; subtraction commutes and the unique charitable benefit is exactly unchanged. This is a derived composition of the cited independent rules, not authority for an invented allocation or for restoring charitable excess after a different exhaustion result. The source fixtures will explicitly demonstrate current use different from modified absorption and conservation in each ledger. Both original108 capacity and final172 capacity will be displayed, not collapsed into one amount.

Existing literal positive-benefit originals have regular current deduction39200, AGI60800, charity19240, old succeedingNOL60800 versus comparison51392, and charitable reduction9408/carry22352. Independent AMT deduction84600/carry15400 has zero charitable comparison. An actual5000 insolvency exclusion fits both: regular carry55800/comparison46392, unchanged9408 benefit and22352 charity; AMTcarry10400. These are original-derived controls, not IRS published examples.

A capital-loss3000 variant has pre-NOL AGI97000, actual regular limit46900/current claim37520, modified regular limit49000/absorption39200; finalAGI59480 and normal charity18844. Comparison retains priorC17844 and yields modified limit61156, absorption48925, carry51075; benefit9725, charity22431. After actualCOD5000, regular carry55800/comparison46075. Independent AMT uses its original priorC5000 plus currentA1000: actual AMTI97000−6000=91000, current deduction81900; modified AMTI100000−6000=94000, absorption84600, pre-COD carry15400 and post-COD carry10400. Its final AMTI remains9100.

## Precise remaining question under research

The primary passages reviewed above do not provide a published individual example where COD exhausts only one of the normal/comparison modified-loss vectors, or where a different108/172 use amount leaves an apparent residual after all108 capacity is consumed. Do not silently implement `max(carry-R,0)` as proof of restored charity, subtract the current/modified difference twice, or infer additional future-income/credit facts. No external credential/human-review blocker is asserted: this remains a precisely bounded interpretation/derivation task while the determined equal-reduction cohort is implemented. Current-origin EBL, later108 attributes, joint/community COD ownership, multiple excess gift origins and2026 unresolved floors retain their existing separate source methods.

## Evidence to be produced

Spec first; original statutory-literal failures; canonical current/modified/closing vectors; actual source-only guide and save/reload/download route; stale original and forged result rejection before PDF I/O; saved originals and independent field/appearance/notice/privacy review. No metadata/readiness/inventory promotion.

## Retained first red

The first four-case run on unchanged runtime returned three failures and one passing boundary control (`charitable-cod-initial-red.log`, SHA256 `476f9526648417b99ec74b6126b754824afc127b2c7ccaa7bc2ebadae4cd7e58`, one worker, 2.18 seconds). Two failures reached the intended existing COD method guards. The capital-loss/Form172 case failed earlier because the fictional original did not yet include its mandatory actual prior capital classification/independent AMT record. The fixture now supplies that actual record; original capital amount and every expected assertion remain unchanged. The first run remains retained rather than relabeled as the completed three-case method red.

The corrected actual-source run reached all three intended method guards, with the fourth boundary case passing: `charitable-cod-source-complete-red.log`, SHA256 `8d4f981f34f4864ea6ee4fd42c8a40347913829ba7b58fe0019268d525c95811`, one worker, 2.22 seconds. This is the retained spec-first source-complete red before runtime edits.

## First green and review-output red

The four original canonical cases passed after the bounded implementation (`charitable-cod-first-green-attempt.log`, SHA256 `6f3cfe488a2b87fe2bc05d5aab7c45b74fa5c2b139c0594605c3b7e7f4b8d8ab`, one worker, 1.86 seconds). This is a focused arithmetic checkpoint, not a complete route or independent clearance.

A separate spec-linked review-output regression then retained one failure and one passing stale-context control (`charitable-cod-review-red.log`, SHA256 `68cdc0f3a05d4f00ecd4ba6b273849b1cc19a7e987b3b3f7b7ec2c6be0d57d20`, one worker, 3.03 seconds). The original mapper omitted the new distinct current-use/modified/comparison amounts. Its reviewed output is now being extended; original input and tax expectations are unchanged.

Federal agent source cross-check refreshed Reg1.108-7(b), Pub4681, Form172 line26 and Reg1.170A-10(d)(1), finding no contrary passage for the stated sufficient-capacity cohort. This is an algebraic source cross-check only, not frozen software clearance or a published combined example. The current-tax108 vector is never recomputed from hypothetical charitable use; migration, capacity beyond either vector and unresolved exhaustion remain guarded.

## Coherent route checkpoint before freeze

The canonical/adjacent/guide/DOM/private-PDF/workspace cohort passed24 tests in7 files, one worker,11.52 seconds (`charitable-cod-route-first.log`, SHA256 `48ec35ae001eb3dcdc3fe40cda6ffd34f219ae2c58d9bfabca80b86c5419ff29`). The real existing panels independently reconfirm the debt, insolvency, regular/AMT loss, current-loss and regular/AMT charitable sources; the actual5001 edited debt produces55799/10399 after-COD carries. A missing zero stays unknown across save. No new source override/control or shared guide runtime change was needed.

Root and web typechecks passed. Spec validation passed5972 references with no missing/broken references. An initial command incorrectly supplied an unsupported `--strict-test-refs` path argument; its CLI-only failure is retained in `charitable-cod-spec-first.log`, followed by the correct existing command in `charitable-cod-spec-corrected-command.log`. Scoped lint initially reported one test-only unused calculation used as a type; that redundant call was removed before the freeze. No deadlines, retries, coverage exclusions or thresholds changed.

The private route uses the reviewed installed pako1.0.11 patch (deflate SHA256 `f537b12f55f31f9af74b162d0ad6b3667c78c356875f18c9f56be4db419d6ccc`) through main dependency symlinks. Metadata, inventory and release gates remain unchanged. Exact frozen broad/build/browser and retained-original artifact evidence, and independent source/output review, are still pending at this checkpoint.


## Immutable V1 verification and retained workflow failure

V1 tree `148048ddffd5a0e421b501d5f234a8c8353c019f` remains unchanged. Its exact affected suite passed 1,201 tests in 167 files, one worker, 89.71 seconds (`charitable-cod-frozen-broad.log`, SHA256 `4b64df82944cf49c4180ec42d7944bca5b4620c92e7dadabb0f7ff109f478b7e`). Root/web/contracts types, 5,972 strict spec references, scoped lint with zero errors/warnings, and both builds passed. The generated inventory check correctly failed as stale after the new spec; that failure is retained and regeneration is deferred to reviewed final integration. All 19 owned and 3,649 tracked source hashes were unchanged.

Independent AI source/software review passed 30 tests in eight files, one worker, 12.45 seconds, including six private controls (`ai-charitable-cod-independent-review.json`, SHA256 `a9ada072d75ad392eda8c0ed53f8bd79607252d482959b784b92545202844be8`). The reviewer retained a first fixture that reached an earlier comparison guard, then changed only that private fixture to reach the intended per-original capacity boundary. Source clearance is limited to the bounded same-reduction composition, not general exhaustion/migration, human tax qualification, or artifact review.

The production browser's first attempt failed to bind its localhost server under the sandbox before assertions. Its second attempt ran both actual desktop/mobile cases with one worker and zero retries, and both failed at the same real workflow boundary (`charitable-cod-browser-attempt2.log`, SHA256 `8a6c779b6ade5af15b5cc26154151d98c80651a1322f88ca5c8f527ae5f32588`). Editing debt properly revoked both charitable confirmations, but the Adjustments section also required the later regular charitable confirmation in Deductions, preventing the actual Continue control from reaching it. The original panels-only test did not exercise that navigation boundary. Neither failed run is relabeled as passing.

The V1 saved originals and 81 PDFs are immutable under `charitable-cod-artifacts-v1/manifest.json` (SHA256 `b86819deac38e7bbc3a7a82b8af16c5f81f3679019f39c426cf474ebee4a248d`). Parent independent review passed 9,873 checks over seven originals, 81 PDFs, 290 pages and 454 populated fields and personally inspected 15 contacts and ten readable pages (`parent-charitable-cod-artifact-review.json`, SHA256 `45f7bd311c57780aae1e904d05f9b3ac26d32b9dd9c9ac369ea8deb5e94d0aac`). Its bounded NOL/charity/COD monetary and presentation verdict is clear. The V1 actual-guided amount owed included a 99-dollar historical estimated-tax result without actual prior-return/payment records; that penalty is explicitly unqualified evidence, not a source-complete Form2210 result. The original incomplete guide and output remain retained.

## V2 navigation correction and complete fictional payment sources

A spec-linked full-shell regression first encountered only a missing jsdom matchMedia setup (`charitable-cod-navigation-red.log`, SHA256 `e3e54fb5b8cb0badbe8c8a204c7c4c55be8cddb528d0f0c19293f96aca99efdc`). After using the same browser stub as adjacent full-shell tests, the unchanged intended assertions reproduced the actual deadlock: three cases passed and the full-shell case failed because Adjustments remained partial (`charitable-cod-navigation-red-actual.log`, SHA256 `109984f4679872b7679972395c910aa4220872d3ae6cc67770cb5466dfb7b757`). Both runs are retained separately.

The runtime delta is confined to four guided helpers/flow paths. Dedicated navigation collectors validate the actual current section's source records while deferring the later regular charitable reconciliation to Deductions. Existing strict builders, canonical calculation, bridge, private PDF assertions and invalidation rules are unchanged. Deductions explicitly validates both original charitable histories when the AMT history packet is present. False, absent, revoked, wrong-year and source-mismatched records still block canonical output. No confirmation is invented or restored by navigation.

The completed V2 fictional guide/browser fixture now supplies its actual prior filed full-year resident single 2024 return facts (Form2210 tax 3,000 and AGI 100,000), regular/equal-installment method, no relief/waiver/special-farmer claim, and explicit empty actual withholding/credit/return-payment histories. The packet confirms completeness through April 15, 2026. This is fixture data only; no Form2210 runtime changed. With current tax 2,351, the independently derived conditional penalty is round((round(2351 * .9) / 4) * .07 * (365 + 304 + 212 + 90) / 365) = 99, and amount owed is 2,450. Existing source edits revoke this payment confirmation, and the real Payments panel must explicitly reconfirm it after Deductions. Browser save/reload and completed PDF evidence will bind these actual fixture facts.

The focused V2 navigation/guide/workspace cohort passes six tests in three files, one worker, 7.76 seconds (`charitable-cod-navigation-green.log`, SHA256 `ae235c5b81e5fe341de620eb7cb47f2a55afc9ade1fde19c893de9f0142d8e57`); root/web types pass. It proves actual Continue reachability, both confirmation revocations, strict builder/bridge rejection while later facts remain unknown/false, later payment reconfirmation, save/reload and original carry amounts. Independent V2 incremental review, frozen affected/static/build/browser checks and completed V2 original/downloaded PDF evidence remain pending. No metadata, readiness, timeout, retry, coverage threshold or exclusion changed.

### V3 retains the current section's AMT charitable history

Independent V2 review reproduced an overbroad navigation deferral: when both actual prior NOL histories are explicitly empty and no COD event remains, current and prior charitable originals still require the AMT charitable history collected in Adjustments. V2 skipped that requirement together with the later regular packet. The strict builder and bridge already rejected the same missing history. V2 remains frozen at `79b93c1e80113331a06ae9c1af00f068fc17dd57`; its independent first log and unchanged private probe remain separate evidence.

A new spec-linked regression first reproduced the incorrect complete section (two passed, one failed; `charitable-cod-navigation-own-history-red.log`, SHA256 `01655defc0f7a5555d59540d939f831d2eefe6eb147a7419dd32b3363a5a5fa3`). The narrow correction always requires the owned AMT history and defers only the later regular packet. Missing, false, null and absent confirmations remain blocked; complete actual AMT facts still permit reaching missing later regular facts without restoring them. No invalidation, canonical arithmetic, bridge, or PDF code changed.

The corrected guide, real panel and workspace cohort passed seven tests in three files, one worker, 5.95 seconds (`charitable-cod-navigation-own-history-green.log`, SHA256 `c2e5e947f9102c765745f756c4436851f8833dfff646890303a29a41dae236b3`). Independent unchanged-probe rereview and final broad/build/browser/completed-payment artifacts remain pending.

### V4 adjacent navigation expectation and retained broader run

The V3 independent rereview passed 23 tests in seven files, one worker, 7.24 seconds, including all six unchanged V1 source controls and three unchanged V2 navigation/payment controls. All 23 owned and 3,649 tracked hashes remained exact. Report `ai-charitable-cod-v3-independent-review.json` SHA256 `b43d42bb00b49fbd3069329abff379afe27d3f2186f5ec687335cc064cf9aacc`; log SHA256 `82ca808640d089328fe712dd35e332334c3056cbb64de04c4c671d39ffc27eb1`.

The exact V3 167-file cohort then passed 1,204 tests and failed one old section expectation (`charitable-cod-v3-frozen-broad.log`, SHA256 `a832558c94a52fdad57b4e40c2fc9c782c68babd7d86fe1df28f83b038fd2fdd`). A separate diagnostic identified only the missing later regular packet mutation in `guided-charitable-prior-nol.test.ts`; its old assertion expected Adjustments partial. The correction keeps every original monetary and strict bridge assertion, asserts valid Adjustments navigation and incomplete Deductions for that later packet, and retains partial Adjustments for all missing/false/mismatched owned AMT and year cases. Its matching spec states the section ownership. No runtime or fixture changed.

The corrected four-file guide/panel/workspace cohort passed eight tests, one worker, 6.16 seconds (`charitable-cod-navigation-prior-corrected.log`, SHA256 `eb41af4213246041d108cf89b89d531458e6566f89db994ab89a24a914024bad`). V3 and its original failure remain immutable. V4 exact broader/static/build/browser and completed-payment artifact evidence follow separately.


## Corrected V4 verification and private integration preparation

Immutable V4 `2089e23daac95f74ad96b238f7376cc99d4f32c8` retains every earlier failure and original source. Its affected one-worker cohort passes 1,205 tests / 167 files, root/web/contract types, 5,976 strict spec references, scoped lint (zero errors or warnings), and both builds. The stale inventory check remains an explicit failure pending parent-owned final regeneration. Production desktop/mobile passes 2/2 with one worker and zero retries; localhost3478 is closed. The exact receipt aggregate is `charitable-cod-v4-frozen-checks.json`, SHA256 `aee285277c256b10796b39140090885fd84e1fa31f9b61f5a0423a794de1ca45`.

Independent V3 source/software review passes 23 tests / 7 files with the same six V1 controls and three V2 navigation/payment controls; report SHA256 `b43d42bb00b49fbd3069329abff379afe27d3f2186f5ec687335cc064cf9aacc`. The V4 test/spec/ledger-only delta is separately clear, report SHA256 `fe942cb7670f2472d37d4ff97508f4f05033a9aab2259b32a6f8db5a729b8ec8`; no redundant executable run is claimed by that review. All retained strict-bridge, monetary, AMT, year and invalidation assertions remain.

The V4 producer saves seven originals and 81 PDFs before its reader; two real browser source snapshots and actual downloads complete nine originals / 83 PDFs / 338 pages / 454 populated fields. The six canonical originals are byte-identical to V1. The guide and browser cases now include explicit fictional prior-year tax3,000, AGI100,000, complete actual payment records and zero payments. Those originals support tax2,351, required annual payment2,116, estimated-tax penalty99 and balance due2,450. The V1 unqualified99 estimate and navigation failures remain unchanged historical evidence.

Parent independently derived all originals and passed 10,430 hash/source/physical/reference/payment/privacy checks, then personally inspected all17 contacts and eight readable pages. Final artifact report `parent-charitable-cod-v4-artifact-review.json` SHA256 `e15056ce9df29405840671b3ec0a3638dd27a6c035aceb4b6d1b39f00ae32c26` is clear. Author reopening separately checks424 physical values,207 reference values,454 widget appearances and769 reference body fragments; author personally viewed nine all-page contacts, nine footer sheets, twelve readable pages and four browser screenshots. Author visual receipt SHA256 `66d9970f2ad285c9fd82d75d468b49d7540b68692c411a107fb5100f27a9bfc9`. The browser originals capture complete source facts before later completed-section navigation metadata; they are not claimed to be exact final navigation-state exports.

This private preparation rebases only the25 owned paths onto `318127142879f68472ab8440a95f1b9abdc49234`. Every base reconciliation is listed in the separate merge manifest. Rule metadata, implementation links, generated inventory, final integration checks and main adoption remain parent-owned and pending. No current-year, independent-human, selected-state, form, hosting or e-file gate is promoted.


## Main adoption verification

Parent verified all 3,693 frozen source hashes, the patch hash and all 25 owned
base paths before adopting preparation tree
`0d867f69681d59f6b1eb65518aa85344da1d7ff3` on the documentation-only
`65cc631c` descendant of its recorded base. The full runtime diff and the two
adjacent guided merge deltas were reviewed. Main passes 55 tests in 16 files,
one worker, 11.77 seconds, root/web/contracts types, 6,024 strict specification
references, inventory verification, scoped lint and both builds. Receipt
`charitable-cod-main-checks.json` has SHA256 `cfe80cf05f00383922ab16f71e4c597a560327a243ab1cd2ca0565884bc31e80`.

Rule provenance advances to `2025.180` / `2026.177-law-integration-draft`.
The regenerated inventory has 567 entries and 152 explicit associations.
The original V4 production browser and saved-output evidence remains attributed
to its original producer; these main checks do not create a new browser run.
Broader COD exhaustion, changed-owner composition and tax-interpretation
questions remain separate. Human review, complete 2026 rules, final-form
qualification and filing gates are unchanged.
