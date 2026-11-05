# External actions needed to finish the 2026 upgrade

Prepared October 26, 2026, after `e3dcc3f`, and rechecked October 31 after
`a3e43a9f`, with public sources refreshed November 1 and current Form1040/Tax Table endpoints rechecked November 2. The owner selected PA and Ohio for all three residency categories on November 2; the remaining external inputs and current internal work are distinguished below. Form 2555 corrections (`5293f451`), two-state source work
(`8d74350d`), the PDF annotation correction (`e3da672b`) and the new-marriage
NOL method (`af85b959`) and signed-foreign/domestic-farm health method
(`80ee9cc2`) are delivered. The November2 ScheduleR correction (`13a5d28e`) and actualScheduleC expense/address package (`75f78914`) are also delivered; their finite source/artifact reviews do not replace the human, staging or full2026 qualifications below. Current verification is recorded in the
[execution checklist](upgrade-2026-checklist.md).
The [November4 continuation](upgrade-2026-current-status.md) separates the latest delivered work, active software tasks and external gates.
This handoff records missing external inputs; it does not declare the remaining
software finished. The [execution brief](upgrade-2026-execution-brief.md) retains
all completion criteria.

The project owner does not need to decide tax formulas. A qualified tax reviewer
must resolve the interpretation questions below and review the implemented
rules and independently derived expected results. Approval to proceed with
engineering cannot substitute for that review.

| Needed action | Concrete input or evidence | Completion criteria affected |
| --- | --- | --- |
| Assign independent human tax reviewers | Reviewer identity and relevant qualifications; reviewed commit, rules/scenarios, official authority, independently checked expected outputs, findings and disposition. The current specs and package ledgers are the review material; passing tests and agent reviews are not human approval. | Complete federal rules, actual facts, historical corrections and qualified scenarios. |
| Launch selection received; state work continues internally | The owner selected Pennsylvania and Ohio, each for full-year resident, part-year resident and nonresident returns. The [state gap analysis](upgrade-2026-state-gaps.md) records the decision and existing implementation gaps. | Selection is resolved. Actual facts, law, local-tax/source methods, forms and six state/residency qualifications still require implementation and evidence; no support or filing activation is inferred. |
| Complete the remaining authorized Preview rehearsal | Preview-only Neon/Redis and Zoho SMTP are connected. The isolated test account is created. Actual source-bound b42afbf5 Preview sign-in, delivered email with exact Preview origin, reset200, old-session revocation, token-replay400, old-password401 and new-password200 passed November3. This is bounded auth evidence, not whole hosted qualification. The old exposed automation token is revoked; its private replacement is explicitly authorized to remain active, including its project-wide system-environment designation, and is reserved for the Stripe sandbox webhook. No production deployment or real payment is authorized. Actual80bc752f Preview test checkout, signed checkout.session.completed delivery200 and same-event manual replay200 now pass; authenticated Starter remains active after both. The [sandbox ledger](upgrade-2026-staging-sandbox-billing-work.md) preserves that checkout evidence. The later [5996 successor](upgrade-2026-staging-subscription-successor-work.md) now also verifies exact Preview receipt counts1/1, named current subscription state1, wrong-owner0 and both approved accounts' zero AI ledger effects. This read-only observation resolves that MFA/query step. Subscription crash/rollback handling is implemented and passes eight actual local PostgreSQL controls in the [atomicity ledger](upgrade-2026-hosted-subscription-atomicity-work.md); deployed failure recovery, credit-pack/provider reconciliation, automatic failed retries and final-artifact qualification remain open. Remaining integrated rehearsal continues internally; do not paste credentials into chat or Git. | Remaining tenant isolation, persistence/deletion, telemetry/limits, outages, Stripe retry/reconciliation, migrations, restore and rollback on the final artifact; repeat auth as needed for final source identity. |
| Provider access received; qualification continues | The supplied testing credential worked in actual November5 synthetic runs. The later authorization permits testing strictly below140USD. Current calculated cost is0.26282160USD plus0.022384USD held for one unresolved usage record, totaling0.28520560USD; the [latest SSA development smoke](upgrade-2026-ssa-v3-live-smoke-work.md) preserves metadata and human-qualification limits. The [actual local ledger rehearsal](upgrade-2026-ai-live-local-ledger-work.md) verifies three provider attempts and two one-cent logical charges, including an engineered rejection and explicit escalation. No key is needed from the owner for these continuing OpenAI tests. See [the live classification ledger](upgrade-2026-classification-live-smoke-work.md). | Representative independently human-reviewed cases, repeated held-out evaluation, natural failure/escalation quality, provider invoice and hosted retail-ledger reconciliation, Google access and final qualification remain open. The development smoke is not model promotion. |
| Assign independent human AI-case reviewers | Review the 240 draft cases, original synthetic inputs, expected monetary/date fields, answerability and safety labels; preserve the held-out partition and record reviewer provenance. Revise or remove unsuitable cases without counting generated variants as independent review. | Representative 200–300-case corpus and qualification metrics. The [executor guide](ai-evaluation-executor.md) describes the evidence and approval boundaries. |
| Assign an independent security/privacy reviewer and an advisory owner | Review the exact application/runtime revisions and staging evidence; provide findings and their disposition. For each remaining image advisory, record the accountable owner and an evidence-backed fix or acceptance with expiry. The [advisory register](upgrade-2026-image-advisories.json) has pending owner confirmation and a November 7, 2026 review date. The retained Node26 ARM64 and exact-tree f09 AMD64 candidates each report181 matches across80 advisory IDs against the November3 scanner database, with zero critical/npm/fixed-version matches. The November4 primary-source refresh keeps all80 open and unaccepted; the ARM64 enclosing scan also failed its post-run memory gate. The previous176-match and68-ID scans are historical. See the [current advisory record](upgrade-2026-image-advisories-20261104.json). Exact final-source ARM64/AMD64 qualification remains required. | Independent security/privacy review and resolved or owned, expiring advisories. No acceptance is implied by the existing component exposure notes. |
| Qualify final official forms as they become available | Final published year/revision PDFs, authoritative hashes and line/field mapping review for each enabled scenario, plus the required independent signoff. The November 1 refresh found final 2026 Schedules C/R; disabled physical candidates are committed in `6ea8907b`. That does not qualify their scenarios or supply final Form 1040/Tax Table. The [source refresh](upgrade-2026-release-source-refresh.md) distinguishes available historical, draft and final forms. | Final physical maps and complete-data filing exports. Draft or historical mappings cannot be approved into a different year. |

## Tax interpretation handoff

These are precise source-method questions, separate from broad human review.
They remain unavailable until a controlling treatment is established and then
implemented and tested. The original records and competing calculations are in
the linked ledgers; the owner is not being asked to choose a preferred answer.

| Question for the tax reviewer | Existing evidence and next deliverable |
| --- | --- |
| Small-business stock exclusion combined with a current net operating loss | [Form 172/section 1202 source ledger](upgrade-2026-form172-qsbs-origin-work.md) retains the specific example where the printed worksheet and statutory recomputation differ by $200. Supply the controlling calculation and authority, including the affected capital-loss adjustment. |
| Reduced deduction containing both employee and business tips | [Tip attribution decision](upgrade-2026-mixed-tips-method-decision.md) records the shared cap/MAGI question and the downstream QBI effect. Supply the allocation and rounding method for the final reduced deduction; no employee-first, business-first or proportional convention has been invented. |
| Reduced joint education-bond exclusion attributable to two educators | [Education decisions](upgrade-2026-education-method-decisions.md) distinguish actual interest ownership from attribution of a reduced joint exclusion. Supply the owner-specific reduction method and rounding authority. |
| Equal partition of an actual community savings bond into separate successor bonds | [Community bond investigation](upgrade-2026-community-bond-method-decision.md) records the actual ownership/payment contract, current official sources and unresolved section 454 treatment. Establish recognition, successor basis and operative state-law conditions; do not infer zero recognition from unchanged wealth or invent two purchase payments. |
| Broader Coverdell account disqualification events | The same [education decisions](upgrade-2026-education-method-decisions.md) identify partial pledge, positive expenses and later account activity. Resolve each specific event/basis/expense interaction before its source routing is implemented. The existing whole-account, zero-expense case does not answer those questions. |
| Two-owner health deduction when a joint 2025 advance-credit repayment cap binds | [Owner-income source ledger](upgrade-2026-marketplace-owner-income-work.md) retains the two different owner-limit results from the same joint repayment. Supply the rule assigning capped repayment to the owners before their separate earned-income limits. |

The narrower rows also require a distinction between an unfinished method and
implemented behavior awaiting tax review. The current source audit confirms:

| Current status | Exact treatment needing qualification or implementation |
| --- | --- |
| Delivered route with residual source-proof question | The Form 8962 living-apart HOH route is implemented. Its policy/counterparty identity is bound, but a separate taxpayer spouse object is checked only when present. The stronger HOH spouse-proof requirement remains a qualification question. |
| Guarded source methods | Situation 2 months covering only one family; K-1 foreign tax with a basis shortfall and later release/payment-year treatment; joint/community insolvency and attribute allocation; compared joint or equal-AGI EIC filers and a nonclaiming parent at or above the filer's AGI; and Schedule AI preferential gains/dividends remain rejected pending their precise treatment. |
| Qualified-statement condition already implemented | A partnership route without Form 1116 requires an actual Schedule K-3 qualified statement. A bare Form 1065 K-1 does not qualify; the old question must not imply it is accepted. |
| Implemented foreign-income conventions requiring review | The 30-percent Form 2555 calculation remains after allocated half-SE and includes guaranteed payments. The separate expense/FEIE attribution and signed line 45 defects were corrected in `5293f451`. Foreign-plan health/retirement deductions passed to QBI still need the stated full-versus-foreign-share interpretation review. The separate independently proven domestic-F-only health method is delivered in `80ee9cc2`; it conserves signed C income and proves F-specific foreign zero without deciding foreign-plan attribution. The ordinary interview cannot originate F, and this method requires canonical typed/imported actual farm sources. |
| Other implemented conventions requiring review | A higher-AGI nonparent claiming no child benefit does not displace the filer. Earlier Schedule AI periods use actual cumulative Schedule 1-A deduction amounts without annualizing that adjustment. The section 1341 claim-of-right comparison uses refund minus amount owed after credits/payments. Schedule AI's $400 test uses net earnings. These are existing calculations, not missing credentials or absent collectors. |

The [method register](upgrade-2026-unsupported-method-register.md) and linked
package ledgers retain exact inputs and source questions. The read-only audit is
retained under `.local/upgrade-evidence/nov01-external-question-audit/`, with report
SHA `3029d9ee198b9335b77fd059d16b2be3b22bbbe574044f7b68baabbbbe4be1c8`.
It supplies no new controlling interpretation or human approval.

The [five refreshed source derivations](upgrade-2026-source-questions-20261101.md)
retain the remaining COD/charitable allocation questions and competing originals.
The charity source-method investigation is recorded in the
[finite charity queue](upgrade-2026-charity-method-queue.md) and
[original-source NOL ledger](upgrade-2026-charity-original-nol-work.md).
Unresolved within-category floor, mixed-vintage NOL and partial cash/property
attribution are not silently treated as completed implementations or as
credential problems. Determined source-complete cohorts continue independently.

## Review records and subsequent authorization

A usable review record identifies the actual reviewer, qualifications/role,
review date, exact commit and artifact hashes, scenarios and sources examined,
independently checked outputs, findings, limitations and disposition. Record an
actual result or a review reference; leave missing reviews explicitly pending.
Do not populate approval fields merely to make a readiness check pass.

After required implementation and evidence pass, versioned artifact publication,
filing enablement and model promotion still require their applicable explicit
authorization. The existing approval covers normal pushes to the public
`utilityfueled/tax-engine` repository's `upgrade/2026-baseline` branch. It does
not authorize production deployment, spending beyond the later under140USD testing
authorization, main-branch merges or force-pushes.

November3 current local source/advisory/PostgreSQL receipts and limits are in the
[refresh record](upgrade-2026-refresh-20261103.md). All45existing DB-file cases pass
on a new disposable local PostgreSQL16.14 cluster, including33previously skipped
cases. This does not complete the authorized remote staging rehearsal.


### November3: bounded377fe Preview tenant/workspace successor

The earlier remaining-Preview row now has additional exact-source evidence: READY377fe passes fresh2actor sign-ins, private/no-store preflight, two-owner workspace save/revision/fresh reload/cross-owner/same-ID namespace checks,3tuple deletion/readback and preserved unrelated baselines, plus a68-byte metadata-only transient upload without shell retention. See [the tenant ledger](upgrade-2026-staging-tenant-workspace-work.md). This narrows that row's finite API-workspace/isolation/cleanup work only for377fe. DB/event/credit row reconciliation, provider durability,25MB/forensic/session-UI, outages/migrations/restore/rollback and final-artifact/integrated staging/release work remain pending; old80bc failures and all human/final2026 gates remain unchanged.
