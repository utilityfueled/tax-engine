# Ohio resident-credit transaction source successor

Source-first successor authored privately at exact `0db95ea531d9d593292d23024c42ac0727e79b34`, now independently reviewed and integrated on current main. Readiness remains unchanged.

The existing finite Virginia paid-tax adapter rejects indistinguishable same-kind,
same-day, same-value receipt rows even when their caller IDs differ. This successor
adds actual separately settled ACH-credit bank originals and actual applied agency
posting originals. Both independent transaction identities must reconcile the same
taxpayer, tax year, state, purpose, period, amount and complete paid account.

The actual ACH-credit entry trace is numeric15 under Virginia's Electronic Payment
Guide Appendix B. No generic bank/provider/eForms confirmation format is guessed.
The eForms filing confirmation is not automatic proof of bank payment. Records are
synthetic test originals; software validation does not authenticate an external bank
or agency account. ORC5747.05(B)(5)(c) and(F) remain the paid-proof prerequisites.

Spec and additive existing-API tests precede product changes. The current scalar
credit formula, original70 author tests and47 independent controls remain unchanged.
Four independently pinned exact accounts preserve credits1000/1000/1001/1394 and
requested Ohio refunds677/677/678/1071. Actual cash receipts sum before existing
printed credit rounding. No native collector, physical PDF, 2026, filing or human
qualification is included.

The first attempt stopped before collection because the sanitized environment lacked
the existing pinned Python interpreter; that prerequisite diagnostic is retained.
The actual existing-API red then produced four new source-admission failures and one
unchanged paid-account positive pass. No import or missing-module failure is counted.

The narrow model and adapter implementation now admits optional settled-bank/applied-
agency originals, validates every provided pair, and requires both independent
transaction identities for an otherwise indistinguishable receipt group. Reuse of
either trace or agency posting is rejected even across different amounts or dates.
Unknown/partial originals, incorrect payment kind, contradictory identities, cents,
chronology or complete-account references still reject. Existing private commitments
bind the full new source records; no raw transaction identity is added to audit.

The first bounded green passed all 165 controls (new48, unchanged author70 and
independent47) and all three type checks. Exact source and six literal skill links
were reverified after runtime. Spec validation7684/7684, AST test references722/722, owned strict lint with zero
errors/warnings, and engine plus production webpack builds also pass. No products,
controls or monetary originals changed during runtime. Distinct independent review now approves the unchanged candidate after31 new controls plus the original165; this is no filing or external-account qualification.


## Main integration verification — November 3, 2026

Integrated on exact main checkpoint `608fa5501ba4dbc5a305c6e9fa454772ab8757e0` after the push was confirmed closed. The two existing product files were still byte-identical to the frozen candidate's `0db95ea5` base, so the independently approved model and source adapter were copied without a manual merge. The four new author files and two independent review files were adopted first, before products. A fresh main existing-API run genuinely rejected all four independently linked positive accounts at the preexisting complete-owner source/schema guard; no import or prerequisite failure was counted as this regression evidence. The original RED log and before-copy receipt are retained.

After exact product adoption, all 196 focused controls in four files and all 1,765 disjoint adjacent Ohio controls in 69 files passed (1,961 tests / 73 files). All three type checks, 7,745 spec links, 730 literal test-reference checks, the regenerated 796-entry inventory plus inventory check, owned-file strict lint with zero errors/warnings, engine build and webpack production build passed. The original 70 author and 47 independent source controls remain byte-identical. Existing unrelated tracked files, `.pnpm-store/` and `docs/reviews/` are preserved.

Evidence is under `.local/upgrade-evidence/nov03-rc-transactions-main-integration`, `nov03-rc-transactions-main-red` and `nov03-rc-transactions-main-green`. Main integration sessions 56551 (expected four-case RED) and 21392 (all twelve GREEN checks) are closed; the runtime lane was released. This is finite synthetic-source software verification. It does not authenticate bank/agency records or establish native, physical, filing, 2026, external-account, or human-review qualification. Root retains review and commit ownership.

Root distinct review pins four independent Decimal accounts before product read:
credit/refund1000/677,1000/677,1001/678,1394/1071. Its31 new controls plus the
original165 pass196/4, with three types and strict zero-warning lint. The first
metadata check rejects two unsupported spec reference keys; the singular-key
metadata-only correction passes7717spec links and726AST controls, preserving
all31 test bytes, original products, monetary/privacy assertions and failed logs.
Review receipt is `.local/upgrade-evidence/nov03-root-rc-transactions-independent/independent-review-result.json`.
Root final main review checks the exact nine-path manifest, complete two-product
diff and all twelve check receipts, finding no additional defect in this bounded
method. The actual linked originals remain synthetic; source validation alone
cannot authenticate a bank or agency. No raw trace/posting identity is exposed in
the audit, and native/physical/human/final2026/distribution/staging gates remain.
