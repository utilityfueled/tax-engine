# External actions needed to finish the 2026 upgrade

Prepared October 26, 2026, after `e3dcc3f`, and rechecked October 31 after
`a3e43a9f`, with public sources refreshed November 1 and current Form1040/Tax Table endpoints rechecked November 2. The owner selected PA and Ohio for all three residency categories on November 2; the other inputs below remain unsupplied. Form 2555 corrections (`5293f451`), two-state source work
(`8d74350d`), the PDF annotation correction (`e3da672b`) and the new-marriage
NOL method (`af85b959`) and signed-foreign/domestic-farm health method
(`80ee9cc2`) are delivered. The November2 ScheduleR correction (`13a5d28e`) and actualScheduleC expense/address package (`75f78914`) are also delivered; their finite source/artifact reviews do not replace the human, staging or full2026 qualifications below. Current verification is recorded in the
[execution checklist](upgrade-2026-checklist.md).
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
| Authorize a specific staging rehearsal and provide secure configuration | Staging project/host, allowed operations and a secure location for test-mode auth, PostgreSQL, Redis, Stripe/webhook and SMTP settings; approved sender and test recipients. The repository's staging hostname alone is not authority to deploy or modify it. Do not paste secrets into chat or Git. | Actual hosted authentication/recovery, tenant isolation, outages, billing reconciliation, migrations, restore and rollback. |
| Supply provider account access and approve a bounded synthetic evaluation budget | Securely configured keys for the selected provider accounts, exact permitted candidates, maximum total spend and permitted test period. Availability must then be checked against those accounts; public model documentation is insufficient. | Repeated live evaluation, actual failed/retried/escalated costs, latency and provider availability. No live spending or model promotion is currently authorized. |
| Assign independent human AI-case reviewers | Review the 240 draft cases, original synthetic inputs, expected monetary/date fields, answerability and safety labels; preserve the held-out partition and record reviewer provenance. Revise or remove unsuitable cases without counting generated variants as independent review. | Representative 200–300-case corpus and qualification metrics. The [executor guide](ai-evaluation-executor.md) describes the evidence and approval boundaries. |
| Assign an independent security/privacy reviewer and an advisory owner | Review the exact application/runtime revisions and staging evidence; provide findings and their disposition. For each remaining image advisory, record the accountable owner and an evidence-backed fix or acceptance with expiry. The [advisory register](upgrade-2026-image-advisories.json) has pending owner confirmation and a November 7, 2026 review date. The latest ARM64 engineering candidate reports176matches across80advisory IDs against the November2 scanner database, with zero critical/npm/fixed-version matches. All80 owner decisions remain pending; the previous68-ID scan is historical. Exact final committed-source ARM64/AMD64 qualification remains required. | Independent security/privacy review and resolved or owned, expiring advisories. No acceptance is implied by the existing component exposure notes. |
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
not authorize production deployment, live spending, main-branch merges or
force-pushes.
