# Signed current-year minimum tax credit sources

This package computes the current year's signed Form 8801 Part I result from actual adjustment originals and the canonical Form 6251. It combines that signed result with the current full Form 8801 line 26 only for the following-year aggregate. Current-year credit use stays unchanged. Section 108 then reduces the aggregate after current tax, using the established credit-unit ratio. Prior original credit rows remain provenance; the package does not assign a negative signed adjustment or COD reduction to invented vintages.

The source contract is `current-minimum-tax-credit-source-contract.json` (SHA256 `9112505691eba83dc124b32cc2ce39339fbb65ba9f8b1614aea2e2cb96c36b0f`) and the empty-original-NOL addendum is `current-mtc-empty-nol-contract-addendum.json` (`cdb8047d49e3872cb4bca6a198c976d93dad277e6b02ebf520763358109d47d5`), retained under `.local/upgrade-evidence`. Both were reviewed before implementation. The independent source-only reading is `ai-current-mtc-contract-source-review.json` (`1ce6df4677672f6f0ae840e48b95e427300ac7ba48707aa174fd45e617ed88b5`); it does not constitute implementation or human tax qualification.

The method requires separately complete actual MTCNOL carryover/carryback and exclusion-only foreign current/carryover/carryback inventories. Only explicit empty inventories are admitted here. Ordinary NOL, ATNOLD, FTC and AMTFTC output zeros do not establish these facts. Every supplied adjustment statement retains its year, entity, owner, reference and signed amounts. Other or trust adjustments cannot qualify merely by netting to zero. Preferential capital, nonresident, foreign-earned-income, nonzero ancillary histories and legacy vehicle-credit methods remain separate.

The narrow guide intake collects an actual continuing domestic non-PTP K1 with an explicit nonpassive answer and an explicit confirmation that every other amount is zero. A blank amount or missing answer remains unknown. Existing K1 packets cannot be replaced or silently merged by this intake. Source edits invalidate the statement, independent-history and root confirmations. Actual false regular/AMT basis sameness is retained when both original NOL inventories are genuinely empty and the current source packet is complete. Nonempty, exhausted or expired histories and negative actual or modified AMTI/current EBL/current Form 172 origins retain their existing source requirements.

## Retained development evidence

- `current-mtc-initial-red-inputs/manifest.json` (`a9c78dcf7329df38394ff653c612697c8d2902de4693335b73d017db649ece80`) preserves the original spec, fixtures, seven tests and independent Decimal expectations before implementation. The first launcher failed on its Python environment and shell variable; the actual second run had four failures and three passes, including two earlier NOL source guards and two intended MTC guards. The original logs remain retained.
- `current-mtc-empty-nol-red-inputs/manifest.json` (`ac64fed921326a0568fd970878993b49438c486c185afe5cbfe696642c35813c`) adds the explicitly false basis answer and current-loss controls. The nine-case red had six failures and three passes; the subsequent core green passed all nine cases and root types.
- `current-mtc-guide-pdf-red-inputs/manifest.json` (`0b226aed9491da404a00d3d6cec7e3ffc6eb873a04af59b3f37d093ff5e56a51`) preserves guide, UI and output assertions before implementation. The first six-case run retained a fixture missing its Credits container plus three intended route/output failures. The changed-result control wrote ten PDFs before its old late rejection; the later assertion in that test had not run. A fixture-only corrected two-case run retained the signed parsing failure.
- The first seventeen-case route run retained three author-test errors: one read a nonexistent `validateSection.complete` property, and two treated intentionally retained Schedule E business identity as a whole-packet privacy prohibition. The corrected checks use the actual validation status and apply business-identity exclusion to the new numeric-only references; whole-packet SSN/private-reference exclusions remain. No monetary assertions or existing privacy policy changed.
- `current-mtc-guide-pdf-green-attempt2.log` passes seventeen tests in six files with one worker. `current-mtc-guide-root-types-attempt1.log` and `current-mtc-guide-web-types-attempt1.log` pass. These checks precede the final combined-source freeze and production browser run.

The PDF context is an explicit separately reviewed foreign-source dependency: complete identifier-redacted federal result binding, excluding only independently attached state returns. `current-mtc-foreign-context-dependency/receipt.json` (`174ad71a828078936cf4cccd50e5bc844a3ec2079cbec11c865ae4a885d80a58`) binds the exact file SHA256 `627d71de41603c9e6dc943c29ecb7805e5b847714237fdcf6d8a4c9649f5efa1`. This file is excluded from the owned MTC patch. The original pre-I/O failures remain retained; both changed source-year and changed canonical Form 6251 results now reject before any write.

## Delivery boundary

The prepared source composes the owned MTC delta onto delivered foreign-source commit `92870a8aff4094d58e7b63fb4aa55036df44a36b`. The six shared files use a three-way merge from `69b86517`; three additive conflicts retain both source methods and imports. The foreign original-record membership check uses the same validated list before the MTC-only rows are removed for their aggregate. Foreign deemed absorption, source-only validation, counterfactual calculation and full-result PDF binding remain intact. The context file is already exact in the new base and is not an MTC-owned change. The original pre-composition archive and checks remain retained separately.

The combined source passes 56 tests in 14 files with one worker, including all owned source/guide/DOM/PDF/workspace cases and the delivered foreign source/output cases. Root, contracts and web types, spec validation and scoped lint pass. `current-mtc-focused-attempt1-checks.json` binds the exact commands, logs and unchanged tested source hashes. `current-mtc-foreign-composition-resolved.json` (`db0ff13f2fc93d85fc9e75ccd0921d85237a894365467aa37bae8d85babdd116`) verifies 3,880 nonowned tracked blobs unchanged. The ledger-only addition of this result follows those checks.

Final combined-source checks, production browser runs, saved original/PDF review and immutable delivery manifest are pending. This record does not promote filing, electronic filing, human review or the closed 2026 output gate. Parent-owned rule metadata, inventory, main adoption and release checks remain separate.


## V1 independent review and corrected source boundary

The immutable `fa0057e821b0dff5b0d4a90de056548294bbd749` snapshot is retained.
Its exact 416 tests / 63 files, three type checks, 6,257 spec references,
lint (zero errors), engine build and production web build passed. These results
belong to V1. They do not establish a corrected browser or final delivery.

Independent review identified one source-presence defect: the canonical empty-NOL
exception admitted an omitted same-basis confirmation even though the accepted
source contract and strict guide require an explicit boolean. Explicit false is
valid when actual current basis differs. The permanent regression reproduced
acceptance before the narrow conditional was changed. The correction requires a
boolean in that empty-source branch and preserves every nonempty-history guard;
no tax expression or current credit amount changed.

The first browser attempt failed only to open the sandboxed loopback listener.
The permitted second attempt retained two distinct failures: desktop expected an
ungrouped saved amount despite the established CurrencyField grouped display;
mobile measured a 136.875px signed input against the unchanged 180px minimum.
The corrected browser expectation changes only that one saved representation to
`-200,000`; all numerical originals, source identities, other fields and privacy
assertions stay exact. The new component's semantic fieldsets retain legends but
remove repeated horizontal insets. Both runtime changes require new immutable
checks and a fresh production build/browser; no reused-build claim is made.

A separate source-linked 2026 supplement uses an isolated test-only indexed rule
injection. Actual 2022 credit originals retain explicit 2023, 2024 and 2025
zero-use histories. From Rev. Proc. 2025-32, single wages 100000 less 16100 gives
83900; 5800 + .22*(83900-50400) gives 13170 regular tax. The 90100 exemption gives
TMT 2574/54574 on AMTI 100000/300000. Signed current generation is +/-41404, current
use in the reversal is 10596, and prior 52000/52001 gives a zero/one following-year
pool. The actual production calculation and PDF export gates remain closed.

The first supplement run retained three setup stops at the existing strict2026
Schedule SE requirement because the new partnership fixture omitted actual zero
Box14A/adjusted earnings and nonfarm classification. Those explicit facts were
completed without changing any monetary expectation. A fourth setup failure was
an error-text matcher that omitted the correct production rule-pack-incomplete
message. The same run also reproduced the intended missing-confirmation defect.
The next exact three-file run passes all 14 tests. The first snapshot wrapper used
a relative evidence path from the private source and failed before recording its
manifest; tests then started. The retained regression manifest is therefore
explicitly post-start, before runtime correction, not a pre-execution claim.

Independent source, saved-original/PDF review, main integration and human tax
qualification remain separate. No metadata, inventory or main/index change is
included in this author package.

Retained evidence hashes:

- `current-mtc-frozen-attempt1-checks.json`: `0383b0a1cfd78aadbc0a78e7508feacc74c6f85f5fc8d575011e2da6fb00aae4`
- `ai-current-mtc-independent-review-v1.json`: `a2dbcdb6343d2ef5b6256a212a5ff72a978eeac115f892f1fe52f53a05581e33`
- `current-mtc-browser-attempt1-receipt.json`: `892414dc9b8b81bdb3ca52a883f56bbf6a1da6f3be00930cd97ac2896be50a4e`
- `current-mtc-browser-attempt2-receipt.json`: `18f2f4f9682a3fa745cd374a562d814c0d23ff2d2dc54eed7bfce7ac8ae02c35`
- `current-mtc-v2-preserved-regressions/manifest.json`: `5e21b2e8ed21a42f4cb624882cee622221dfe713ed99e8252403fa4375a4c61c`
- `current-mtc-v2-presence-supplement-first.log`: `90ff42d7bbf53ddbf814440a73bdd42e62c90c47599065c65296ae8eebb66868`
- `current-mtc-v2-presence-supplement-second.log`: `6a34a4b9d05103a9e991f48e2fcb89e55666a6fe62b4ffa54adf59d1b63f5844`
