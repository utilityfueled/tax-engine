# Charitable loss origins: actual sources and deduction choice

This package connects existing donation-only digital-asset receipts, charity-only K-1 statements and one original prior charitable vintage to the existing current-loss calculation. It also supplies the actual 2026 standard or nonitemized choice to that calculation when both prior NOL histories are explicitly empty. It does not collect a computed deduction, NOL, carry or AMT adjustment.

## Sources and derived controls

The source/spec and failing tests preceded implementation. Official sources refreshed on 2026-10-26:

- [Form 172 instructions](https://www.irs.gov/instructions/i172), Part I lines 6–9, and [26 CFR 1.172-3](https://www.ecfr.gov/current/title-26/section-1.172-3) limit the selected nonbusiness deduction group against actual nonbusiness income. Undeducted percentage excess does not enter that group.
- [IRC 63(b)(4)](https://uscode.house.gov/us/usc/119-118/t26/s63/) separately lists the section170(p) deduction. [IRC 56(b)(1)(D)](https://uscode.house.gov/us/usc/119-118/t26/s56/) removes the standard deduction for AMT; it does not remove the separately listed section170(p) amount.
- [IRC 170](https://uscode.house.gov/us/usc/119-120/t26/s170/) and [26 CFR 1.170A-10](https://www.ecfr.gov/current/title-26/section-1.170A-10) retain original contribution category, year, actual percentage excess and expiry. An unclaimed deduction does not automatically become carry.
- [26 CFR 1.55-1](https://www.ecfr.gov/current/title-26/section-1.55-1) retains actual regular AGI for AMT percentage limits. [26 CFR 1.199A-1(e)(5)](https://www.ecfr.gov/current/title-26/section-1.199A-1) retains the regular section199A calculation. An independent AMT charitable opening can change the current AMT deduction even with no prior ATNOL.
- [IRS partnership-basis FAQ](https://www.irs.gov/newsroom/new-limits-on-partners-shares-of-partnership-losses-frequently-asked-questions) and the previously reviewed section704(d)/1366(d) source methods retain appreciation separately from basis-limited charitable deductions. Existing source validation determines that amount before section170; this package does not invent an entity-basis allowance.

These literal controls are derived from the sources, not published matching examples or human qualification. Unless stated otherwise, wages20,000, active ScheduleC loss40,000 and taxable interest30,000 give AGI10,000; actual personal tax20,000 is itemized.

| Actual source and selection | Regular new NOL | Alternative new NOL | Charitable result |
| --- | ---: | ---: | --- |
| Long-term public digital-asset gift60,000 | 13,000 | 0 | Current deduction3,000; independent regular and AMT excess57,000 |
| Current K-1 stock FMV80,000 / basis40,000 / available entity basis20,000 | 13,000 | 0 | Section170 source60,000; separate basis suspension20,000; deduction3,000 and excess57,000 |
| Original2024 public-capital carry50,000 regular /1,000 AMT; no current gifts | 13,000 | 0 | Deduction3,000 regular /1,000 AMT; signed AMT adjustment+2,000; original2024 regular remainder47,000 and AMT remainder0 |
| Isolated2026 public cash20,000; actual standard16,100 plus170(p)1,000 | 7,100 | 0 | Nonbusiness deduction17,100 is below income30,000; AMTI9,000; each percentage excess14,000, without the itemized50 floor |
| Same2026 gift; actual nonitemized choice with no standard entitlement | 0 | 0 | Actual170(p)1,000 retained; AMTI9,000 and each percentage excess14,000 |
| Isolated2026 current crypto or K-1 public-capital source60,000; standard choice | 6,100 | 0 | No170(p) deduction; AMTI10,000; each percentage excess57,000 |

## Complete facts and calculation boundaries

The crypto route admits actual donations only, with the existing recipient, year, holding, per-gift valuation and similar-property appraisal checks. Trading lots, business mining/staking, swaps, rewards, NFT, lending and liquidation activity still require their own current-origin classification. A K-1 must have every original charitable/basis/at-risk attachment, nonbinding actual at-risk proof and no other current or prior income/loss, foreign, operating, QBI or positive distribution-gain source. A net aggregate zero does not establish that classification. Prior charitable basis releases retain their separate timing method.

Current sources require independently confirmed empty regular and AMT charitable histories. The prior-only route instead validates one actual original category/medium/vintage in each independent full history, keeping contribution year and expiry. It uses the existing actual prior-history collector and current AMT adjustment; a smaller AMT opening is never copied from regular charity.

The 2026 choice route requires actual standard entitlement and explicitly empty regular/AMT NOL vintages. The candidate receives an internal digest freshly derived from the original charitable sources and current-origin year. Absent, wrong and stale proof reject; no client input can supply an allowance override. Existing prior-loss comparisons retain precedence. Real2026 calculation and filing/export gates remain closed.

Existing crypto, K-1 and prior-history collectors reach the method. Source edits revoke dependent histories and current-origin confirmations. Missing history leaves preview/export incomplete even when no old NOL is entered. Original amounts, category, medium, receipt identity and independent values remain bound to the server-local review context through identifier redaction. Removed sources or balanced stale results reject before template I/O.

## Verification record

Local evidence is retained under `.local/upgrade-evidence/charity-origin-closure-*` and is excluded from publication. No live taxpayer, external provider or filing submission is used.

- Five initial core cases failed on the previous current-origin/choice guards. Three first passed; the remaining two exposed the independent canonical guards that also required the source-bound method. All five then passed.
- Three boundary cases separately exposed a prior-history guide completeness gap and the original-receipt review predicate's direct-donation-only assumption. The corrected source, guide and unmocked workspace checks pass; absent originals and stale independent values remain rejection controls.
- An existing isolated2026 test expected the old standard-choice rejection. Its before/after evidence is retained. It now checks actual7,100 NOL/14,000 carry while preserving the original itemized15,950/14,050 oracle and real-year gates.
- The private development cohort passes293 tests in90 files with four workers, plus root/web types and the production build. The first type check identified two optional vintage accesses; explicit presence checks corrected them.
- Desktop/mobile production browser cases pass2/2 with zero retries. They remove actual basis, confirm incomplete facts, restore original basis, renew the dependent source confirmations, reload exact quantity and cents, and download the actual review PDF. Its13,000 current loss/57,000 carry, every-page notice and source privacy assertions pass. The first run used nonexistent bundle/button labels; its failure/context are retained. Only selectors changed to the observed draft labels, including the explicit not-a-filing-copy text. Screenshots were inspected and the loopback server stopped.

The reviewed source tree is `107176862b8097a5a533c6cd759d153aa6e0c68b`. Its exact rebased cohort passes838 tests in94 files with four workers, root/web types,5,527 spec references, inventory validation, scoped lint with zero errors and five existing warnings, and the production build. The exact production browser rerun passes both viewports with zero retries; its server was stopped. The larger838-case cohort includes adjacent source, canonical, guide, PDF and inventory checks beyond the293-case development cohort; neither result replaces or hides a failed test.

The retained generator has SHA256 `4356bd48151ee7ecb8353f72fcc5d1a6c1bcb6c6d23574dd0dfd4bdf69751d3a` and ran against all26 unchanged reviewed blobs. It produced49 synthetic PDFs with110 pages and259 nonempty fields, including the actual guided workspace packet. The author independently reopened them, checked20 literal physical fields and every-page notices, and inspected all contact/footer sheets, seven readable detail renders and both browser screenshots. An initial reader used the wrong6251 widget prefix; its failure is retained, and only the evidence reader was corrected because the expected amount was already present.

The parent agent independently refreshed the official sources and passed14 tests in seven files, including five private controls for negative AGI, combined actual crypto/K-1 value with separate basis suspension, reversed independent prior histories, net-zero unsupported sources and one-time2026 whole-dollar reporting. All26 hashes remained unchanged. Its source report is `.local/upgrade-evidence/parent-charity-closure-source-review.json`, SHA256 `2a2c2e8d8f35764e5c04108c15767e6ef7619beb1a7c8d72632f07876f196346`.

The separate parent artifact review rehashed the producing sources and generator, reopened all49 PDFs/110 pages/259 fields, checked12 literal ScheduleA fields plus regular/AMT loss and carry statements, and visually inspected seven contacts and16 readable details. Personal and ambiguous tax identifiers are absent; explicit business EINs remain under the existing output policy. The initial private checker treated every EIN as private; that overbroad reader failure was retained and corrected without changing product code or tests. The clear report is `.local/upgrade-evidence/parent-charity-closure-pdf-review/checks.json`, SHA256 `95d4e30e84164575f0a40326a08177895d4714485caa3bc32bce264700cc6349`.

Final delivery is rebased privately onto `b511577a14b055a77de3ba9d879461dab30c7f56`. All reviewed executable, test, UI and specification blobs are unchanged; only this completed evidence ledger, rule provenance, generated inventory and the merged implementation-link list differ. All43 predecessor links are preserved with one added closure link. The final focused rebase cohort passes565 tests in13 files, root types, all5,536 spec references and the regenerated524-entry inventory. This smaller cohort covers the new source/choice, original/prior, PDF/workspace, rule-pack/readiness and spec/inventory boundaries; the unchanged broader838-case result and production browser/build evidence remain separately attributed to the reviewed source tree. A shell wrapper attempted to assign the reserved zsh `status` variable after the first successful type command; its wrapper failure is retained and the direct type command passed without that assignment. Final hashes and exact logs are retained in the local final manifest. Agent checks do not establish independent human tax-law, form or filing qualification.

## Finite remaining work

After this source/choice closure, the determined implementation queue has two classes: the generalized current/prior2026 floor case where the entire floor reaches unambiguous current-year sources or is zero; and complete old-NOL cases with zero reduction or one uniquely affected excess origin, with independent regular/AMT proof and actual selected carry/reference output. Collector and source-validation follow-through are part of each class.

Four precise controlling-interpretation questions remain separate: within-category current/prior floor attribution and original expiry, including pre2026 and basis-release origins; nonzero NOL benefit attribution among multiple affected excess origins beyond the specified public-before-other ordering; partial same-category cash/property attribution; and prior-C treated-paid consumption versus final use after the amended2026 B offset. Neither arbitrary per-source replay nor an inferred medium priority resolves these questions.

Original K-1/crypto COD composition remains separate from the established direct-current-only COD method. Broader operating-K1, farming and estate loss-origin methods retain explicit support exclusions unless a named ordinary brief requirement identifies a concrete dependency. The remaining endpoint does not expand into specialized conservation, food or similar elections.
