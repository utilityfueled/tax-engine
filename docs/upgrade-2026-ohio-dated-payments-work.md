# Ohio dated Part II successor work ledger

Status: independent review found a zero-dollar receipt precision-guard bypass in frozen state 02. Source-first regression reproduced the defect; corrected state 04 passes bounded checks and awaits independent re-review. Still isolated, internal 2025 ordinary Part II successor. No qualification, filing, account-source admission, or 2026 readiness claim.

This recovered package starts from the exact committed base in `.local/upgrade-evidence/nov02-ohio-payment-sources/dated-successor/recovery-v2/ownership-before-edits.json`. The previous temporary checkout disappeared; historical receipts remain historical and do not establish continuity of this reconstruction.

## Source contract

- [Ohio Revised Code 5747.09](https://codes.ohio.gov/ohio-revised-code/section-5747.09): actual receipt dates; equal-quarter withholding absent proof of actual dates; cumulative uniform-rate deficit preserves current-installment priority.
- [Final 2025 IT/SD 2210](https://dam.assets.ohio.gov/image/upload/v1762982551/tax.ohio.gov/forms/ohio_individual/individual/2025/itsd2210.pdf), revision 11/25, SHA256 `8729512c897b6863f350d8f1909afe63e9f2cc44f17cc78f1a856ef51ddc3bce`: lines 10–17 and published factors `.013580/.019932/.026311/.017248`.
- Historical 2023 page 4 full and partial payment examples supply different precision precedents. They do not prove a universal current-year method. The preserved chosen guarded contract SHA256 is `5905f94409f413c5289e8e3e356cd9e9e46a775e396db6f1769c5e65b5c12ba5`.
- Accept changed-balance intervals only when exact segment interest, six-decimal segment factors, and cent-rounded segment interest agree at the reported whole-dollar line. Otherwise reject as precision unavailable. Keep unchanged published endpoint factors.
- Exclude segment start and include receipt/end date. The old-rate segment ends December 31; January 1 receives the new rate. The independent rate-boundary control is 77/30/15 days.
- Reject positive-balance accrual beyond the actual snapshot date. Filing date does not imply payment. Require finite nonnegative whole-dollar inputs and actual receipt dates.

## Durable progress

- [x] Reconstructed isolated exact committed base; restored archived symlink targets.
- [x] Spec written before tests; original fixtures and ten tests written before product.
- [x] Preserved pre-product source snapshots and SHA256 receipts under `recovery-v2`.
- [x] Independent Python Decimal expected-value controls: partial 9; full-calendar 35; rate-boundary 28; last-quarter early settlement 3; precision conflicts 27159/27160, 26721/26722, and 6/7.
- [x] Genuine missing-module red on recovered source: attempt 02, product absent, log SHA256 `401ef45a51767b2ccc7fc50ea1822e29ac033254baa10c8c26a4641ac95b64ef`. Attempt 01 was a retained environment prerequisite failure, not a test red.
- [x] Product after genuine red; first output 10/10 green, then compatibility checks 77/77 (10 new plus 67 existing).
- [x] Root/web/contracts typechecks; Ohio spec validation 332/332; owned ESLint with zero warnings. Initial lint five non-null warnings retained; structural tuple iteration removed them, then focus/root types/strict lint repeated.
- [ ] Independent review and any fixes.
- [x] Bounded five-file artifact frozen for root review under `recovery-v2/state-02-green` plus patch and manifest. No source qualification or independent-review claim.

## Remaining gates

This pure helper cannot admit a taxpayer return. Canonical source/account/year eligibility, safe-harbor replay, declared source policies, dated receipt identity and coverage, prior-return rules, school district account support, special-method qualification, independent review, and 2026 published forms remain separate successor gates. Frozen OH18 and guide V2 stay unchanged. No commit or push is made from this private source.

## Independent zero-receipt finding

Reviewer control remains unchanged under `.local/upgrade-evidence/nov02-ohio-dated-independent-review`: required 2,000, zero withholding, actual 42 payment May 15 has reported exact/factor/cent disagreement 6/6/7. Adding a zero-dollar April 26 receipt wrongly created a cent segment and admitted 6/6/6. Frozen state 02 remains retained as reviewed evidence. Spec and an additional author regression now require only actual balance-reducing receipt events, including no effect from zero or fully excess receipts. Product correction followed genuine author regression red (10 passed, 1 failed). It now aggregates receipts by actual date and admits an interior receipt event only if the unpaid cumulative balance falls. Zero or fully excess receipts create no interest segment. Corrected focused tests passed 78/78 (11 new plus 67 existing), root typecheck, Ohio spec 332/332 and owned ESLint with zero warnings. Root/web/contracts types had also passed before this local correction. No independent re-review outcome is claimed.


Independent corrected-source review passes18tests/2files: the unchanged original
seven controls plus eleven author tests. Exact source patch SHA256
659f7b0a13a778f6001d9d8fc4c4a12408226070e3599bb1fc37f6a6efc48c54
and review receipt SHA256
a3e511fa94492676e7acbade2260fc0188e1065f8011c21b5358bac9d5cb8a9b
are retained under `.local/upgrade-evidence/nov02-ohio-dated-independent-review/
corrected-state04`. The original guard-bypass failure is retained: zero-dollar
receipts must not create rounding events. Actual aggregated same-day balance
reductions determine segments; a zero/excess receipt cannot bypass the precision
agreement guard. Independent60-digit Decimal originals and all seven controls
remain unchanged. Main integration checks follow separately. This bounded pure
2025 PartII method does not establish actual receipt/PartI/source eligibility,
full state/2026 returns, physical form or human qualification.


Main integration passes889tests/7files, all3typechecks,6644/6644spec references,
inventory generation/freshness, strict ownedlint0errors0warnings and library build.
The exact command/log hashes are in
`.local/upgrade-evidence/nov02-parent-ohio-dated-main-checks/checks.json`.
The parent reviewed the complete five-file source diff, verified the frozen source
hashes before adoption and regenerated the inventory; no existing method, original
assertion, coverage threshold, privacy control or readiness gate was weakened.
