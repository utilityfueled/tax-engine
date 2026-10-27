# Savings-bond original reissue sources and return reporting

Private package on `78a5219`, researched October 27, 2026 UTC. The original six-path prerequisite remains frozen at `ae70d3b6`; the completed package adds actual statement reconciliation, canonical reporting, visible source controls, save/reload and an original-bound review context. Main/index and public readiness gates are unchanged. Broader immutable verification, production browser evidence and independent review remain pending at this freeze.

The source model retains the original joint owners, original assigned date and series, actual purchase funds, an actual dated reissue value, all successor originals and their current redemption links. Each owner’s earlier reporting and each successor’s later prior reporting remain separate. The calculation derives current transfer recognition and redemption interest; it does not accept a calculated exclusion, gain, ownership percentage or reconstructed accrual value.

The bounded methods are the whole reissue to one original co-owner, proportionate separate reissue and a sole funder’s partial transfer. [Publication 550](https://www.irs.gov/publications/p550), under “Ownership transferred” and “Purchased jointly,” supplies these rules and the two split-registration examples. The actual accrued values and later redemption values in the fixture are derived controls, not published IRS numerical answers. [TreasuryDirect](https://www.treasurydirect.gov/savings-bonds/tax-information-ee-i-bonds/) separately explains transferor/transferee interest. [IRC 135(a)](https://uscode.house.gov/us/usc/119-118/t26/s135/) limits the education exclusion to redemption interest. [Form 8815](https://www.irs.gov/pub/irs-pdf/f8815.pdf) supplies the actual source worksheet and later reporting boundaries. These sources were refreshed on October 27; no projected retrieval time is recorded.

Exact fractions use finite original amounts as Decimal numerators and positive denominators. No finite quotient is used as a substitute for the source fraction. The one-third control keeps the current transfer and current redemption components separate, then reports their exact aggregate. Decimal’s global precision remains unchanged.

The first spec-linked source run retained five missing-method failures and two passes before implementation (`bond-reissue-source-red.log`, SHA256 `1728a044d943c14cd25e86f5ed9456885f5218ddb980b63e8e44df72d5fe3cbb`). The initial absent-packet test was clarified to use truly source-free input and separately reject a remaining history link; a missing packet cannot erase an existing source link. Seven source cases then passed. A further original-identifier regression failed while the implementation accepted an absent physical bond identifier (`bond-reissue-security-identity-red.log`, SHA256 `393bfa48461ead4a535dddb2fec5e11a5bb7b4a033be427a0483e80491126e80`). The correction binds actual Treasury/paper identifiers separately from saved row keys, including duplicate original detection.

The first root type check found two incorrect `dateOfDeath` keys in a structural `Pick`; the actual taxpayer type contains no such field. The source packet’s explicit living-owner fact remains required. That type-only correction and both initial logs are retained. Final prerequisite checks:

- 79 tests / 4 files, one worker, including eight source cases and existing Form 8815, educator ownership and guided source controls; `bond-reissue-source-cohort-attempt2.log`, SHA256 `91705be14dcbd48a4199630afc1079c292b4f4d899d9020729092445172f0799`.
- Root type check passed; log SHA256 `94f796bb0206599336938c954ee7908ef85090a6945032ec0ade517d53df8ce7`.
- 5,862 spec references passed; log SHA256 `f30f7e7bdeca76e7867ba642a29e1a4b47e7703ff2c4242485768fd3d3185fd1`.
- Scoped lint passed with no warnings or errors.

The completed return route binds each actual current Form 1099-INT by its original index, payer, account, owner and Box 3. Complete redemption and current-transfer lists, actual prior interest included and other Box 3 interest are independent facts, including explicit zero and empty lists. The calculated transfer is not added to already reported original interest. Current transfer recognition stays taxable; historical recognition is removed only to the extent its actual inclusion in current statements is confirmed. Source fixtures cover one combined statement and separate transfer/redemption statements, reordered originals, exact one-third ownership, and no double reporting.

The printed Form 8815 source worksheet is retained, with separately identified current-transfer recognition outside the eligible redemption interest. Exact ratios and actual cents are aggregated before a reporting boundary. [The Form 1040 rounding instructions](https://www.irs.gov/instructions/i1040gi) require adding cents before rounding a total. A new regression retained the erroneous rejection of two actual $0.49 statements when comparing the reported exclusion to raw cents (`bond-reissue-reporting-cents-red.log`). A second regression retained the incorrect upward rounding of four original amounts just below $0.125 each (`bond-reissue-precision-red.log`). The corrected source route preserves every input digit and uses a private Decimal context/exact ratios; no global precision or invented source penny allocation changes. Current transfers of $0.50 plus $0.50 report $1 once.

The new guide panel collects actual purchase, reissue, successor and statement records. It links existing redemption rows, preserves missing/false/zero, and revokes history, current-statement and root confirmation after substantive edits. Real DOM controls complete the actual source packet and canonical $400 exclusion / $100 taxable interest / $80,100 AGI. Saved/reloaded workspace output uses an opaque original context prepared before redaction; changed income, identity, history, original statement, amount, audit, removed sources and serialized tokens reject before PDF I/O. Reference output uses ordinal source labels and exact monetary fractions without original identifiers or private account references.

Retained implementation evidence includes the actual canonical missing-method red after correcting a fixture-builder setup mistake; the guide missing-method red; the PDF stale-context red that wrote output before the new context existed; and both cents regressions. The first successful PDF reader used a nonexistent Form 1040 key for the blank SSN assertion; it was corrected to the actual `primarySSN` field without changing expected privacy. Web types identified the draft optional date of birth, now explicitly validated before passing the actual household to the source calculator. Browser fixture generation copied fictional source records only and is not counted as an authored behavioral test.

At the completed-route freeze, 21 tests / 6 files pass with one worker (`bond-reissue-package-attempt1.log`); root and web types pass; all 5,876 spec references pass; scoped lint has zero errors and six preexisting warnings in the shared federal/PDF files. The immutable manifest retains exact sources and the red/green log hashes. Later broad/build/browser/artifact results must be recorded separately against that tree.

Still unfinished outside this coherent reissue return route: ordinary unchanged one-third ownership and the exact educator downstream reduction/MAGI ordering require their completed rational handoff. The reduced joint exclusion’s two-owner attribution and changed state-property history remain their precisely documented questions. The current source helper can retain a held successor alongside a current redemption; this package does not claim a separate no-redemption transfer-only education return. Further reissues, nonproportional two-funder splits, deceased/trust transfers and unrelated new-owner regimes are not inferred from a complete single-event packet. Mixed July 4 QTP chronology and positive mixed-purpose student-loan-interest attribution remain separate finite education work; they are not resolved by this bond package.

This is software/source evidence only. It is not independent qualified tax review, final-year form qualification, e-file validation, live provider evidence or release readiness.

The immutable first completed route `a673cb0d` passed 1,616 tests / 168 files with one worker, root/contract/web types, 5,876 strict spec references, scoped lint with zero errors and the six existing shared-file warnings, and both builds. Every owned and tracked source hash remained unchanged. Its inventory check failed because the three new specs were not yet generated into the inventory; this failure is retained, not suppressed, and the final integrated inventory remains pending.

Independent source review retained 27 passes / one failure across eight files (`ai-bond-reissue-source-review.json`, SHA256 `56ead320e1053b4135878c045c2598ec73be592bc3c5a613779a0c22e73a7696`). The failed control identified a real additional rounding error: actual original Box 3 of $1 consists of current transfer recognition $0.50 and eligible redemption interest $0.50, but subtracting the separately rounded transfer $1 from the rounded worksheet interest $1 incorrectly reported eligible interest zero. The original source snapshot and 66-PDF / 241-page artifact set remain unchanged and are not presented as corrected evidence.

The new spec and two permanent calculation/PDF regressions failed before the fix (`bond-reissue-half-dollar-red.log`, two failures / eight passes). The corrected source route aggregates exact eligible redemption ratios after separating current recognition, then reports Form 8815 line 6. The separately displayed current-transfer subtotal is not subtracted after its independent rounding. Actual originals remain unchanged. The calculation controls cover $0.49, $0.50 and $0.51; the half-dollar review preserves both exact fractions, reports exclusion $1 and physical AGI $80,000. The first green reader expected a printed zero on Form 1040 line 2b, but the established mapper leaves zero blank; that reader-only mismatch is retained and corrected to the existing blank-for-zero convention. All 23 package tests / six files then pass with one worker (`bond-reissue-half-dollar-green-attempt2.log`, SHA256 `69860c6aa449473691c1c1826f47d1ea9dbc685a2fa3342b130ff27a3a95e0c0`).

The first production browser start was denied by the sandbox before any assertion. The approved second run passed both viewports' actual source edit, unknown/zero, reconfirmation, reload and local privacy controls, then correctly received a Draft Return Bundle because the test had not visited the selected investment route's Other Taxes section. That failure and all original assertions remain retained. The corrected test uses the normal Continue controls to visit and complete that section before final review; it does not alter product completion rules, force clicks, deadlines, retries or monetary/privacy assertions. Corrected execution remains pending at this freeze.

Corrected immutable V2 `17945f62` passed independent re-review with all seven original private probes unchanged: 30 tests / eight files with one worker, including the former half-dollar failure. All 32 owned hashes remained unchanged and 25 were identical to V1 (`ai-bond-reissue-v2-source-review.json`, SHA256 `aed362387615f3d808c8be67523fffeb2514e1a8269a68601bc4732f4fee8c6f`). The reviewer requested a precise scope clarification: exact eligible-interest reporting applies to every actual reissue packet, including historical-only packets and accompanying ordinary redemptions. Preserved printed worksheet 1–8 values are independently rounded audit subtotals and can differ when algebraically combined from the final exact-source line 6 total. The documentation-only V3 adds this explanation; it changes no runtime or test blob. Saved-output and production browser clearance remain separate.

Final integration is prepared privately on `bc35f5d2fca06d303a412af190ddd29a8c4ed064`, with rule provenance 2025.175 / 2026.172 draft. The preceding exact V3 source, failed original covers and footer-overlap artifacts remain unchanged. V3 passed 1,618 tests / 168 files with one worker, root/contract/web types, strict spec checks, lint, both builds and two actual production browser cases; `bond-reissue-v3-evidence-addendum.json` records the exact receipts. AI independently cleared V2 with 30 tests / eight files and seven unchanged private probes, then cleared V3's two-document clarification (`ai-bond-reissue-v2-source-review.json`, `ai-bond-reissue-v3-doc-review.json`). These are software/source reviews, not human tax qualification.

Parent independently derived the saved original numerical and physical values, then found two separate output defects: the positive-exclusion cover had called the reference packet supported, and a long Form8815 computed-total row overlapped the review footer. Those prior artifacts and failures are retained. The final base includes the independently reviewed readiness correction `499dc198` and pagination correction `bc35f5d`, as well as shared-marriage `7dd7fab`. Rebase merges preserve the newer passive-capital and shared-health federal hunks; the Form8815 mapper merge preserves every new pagination call while adding only the previously reviewed bond source summary. No new tax arithmetic is introduced at final integration.

The saved-workspace and two browser checks now additionally require the actual cover's partial packet status and its Form8815 reference explanation. Existing monetary, source privacy, per-page notice, edit/reconfirmation and deadline assertions remain unchanged. Final regenerated originals, browser downloads, immutable checks and parent delta/artifact review are pending; they must be recorded against their exact final source rather than attributed to the older source artifacts.

Final frozen source `fd00f25f4b5ffdc9dd37abb6aaa70fa33c83648e` passes
1,633 tests in 171 files, a separate 16-test/six-file merge cohort and 41
readiness checks in three files, root/contract/web types, 5,945 spec references,
561 inventory entries, focused lint and both builds. Production desktop/mobile
source editing, reconfirmation, reload, download and reopen pass twice with
one worker and zero retries. The final author evidence addendum SHA256 is
`132a0f9806ca67bc436ddd6de7db2f04d0fbd1a7b7cc8cae9eee77547ef87768`.
All 3,622 tracked and 35 owned source hashes remain unchanged.

Parent final source review passes 33 tests in ten files, retaining the same
seven independent controls and adding the readiness/pagination regressions.
Its log SHA256 is
`e0ee77e2620da61700b5a93288f7bbad6bc86b8bdad0083d3e086526f450b462`.
The two executable rebase results exactly match independently reproduced
three-way merges. Parent independently derives the final original inputs using
Decimal precision 300, reads every saved PDF, and passes 7,867 comparisons over
76 PDFs, 301 pages, twelve originals and 293 populated fields. No engine result
or author numerical oracle is used for those expected values. All original
input hashes remain bound to their producer. Twelve all-page contacts, seven
readable reference/cover details and four actual UI screenshots were personally
inspected. All three actual guided/browser covers are partial, and the former
footer overlap is absent. A separate positional check reads 2,153 body fragments
across all 65 Form 8815 reference pages in 21 standalone/merged PDFs: baselines
range from 52 to 752 points, above the unchanged 40-point body floor.

Parent saved-output receipt SHA256: `cfc9180aed0f6176a7a2817d81ecca4e8ca15ca9722a53d2a9712fcce96606ad`.
Geometry receipt SHA256: `32653d6a33a2e17d2f492ac0c13de1e1294b1b77d41c3f461cee7c9f361ef94e`.
The original half-dollar, cover and footer failures remain retained alongside
these corrected artifacts. Main adoption checks pass as recorded below.

Main adoption passes 92 tests in ten files with one worker, root/contract/web
types, 5,945 spec references, 561 inventory entries and focused lint with zero
errors and six existing warnings. The test log SHA256 is
`7e663a8268e15325e7c346888215aca156fe3ed069823ae2fc78880014d5ef0c`.
The main check receipt is `.local/upgrade-evidence/bond-reissue-main-checks.json`.
Both builds and production browser evidence above bind the unchanged executable
source in the frozen producer; they are not described as a full integrated CI
run. Complete coverage and final hosting/recovery evidence remain separate.
