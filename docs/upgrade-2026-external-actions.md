# External actions needed to finish the 2026 upgrade

Prepared October 26, 2026, after `e3dcc3f`. Internal implementation and final
verification continue in the [execution checklist](upgrade-2026-checklist.md).
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
| Select one or two launch states from actual demand | The states and intended residency/scenario population, with the demand basis. The [state gap analysis](upgrade-2026-state-gaps.md) compares existing dedicated implementations. No demand-based selection has been supplied. | Selected-state law, facts, forms and support matrix. Selection is followed by implementation and qualification; it is not itself qualification. |
| Authorize a specific staging rehearsal and provide secure configuration | Staging project/host, allowed operations and a secure location for test-mode auth, PostgreSQL, Redis, Stripe/webhook and SMTP settings; approved sender and test recipients. The repository's staging hostname alone is not authority to deploy or modify it. Do not paste secrets into chat or Git. | Actual hosted authentication/recovery, tenant isolation, outages, billing reconciliation, migrations, restore and rollback. |
| Supply provider account access and approve a bounded synthetic evaluation budget | Securely configured keys for the selected provider accounts, exact permitted candidates, maximum total spend and permitted test period. Availability must then be checked against those accounts; public model documentation is insufficient. | Repeated live evaluation, actual failed/retried/escalated costs, latency and provider availability. No live spending or model promotion is currently authorized. |
| Assign independent human AI-case reviewers | Review the 240 draft cases, original synthetic inputs, expected monetary/date fields, answerability and safety labels; preserve the held-out partition and record reviewer provenance. Revise or remove unsuitable cases without counting generated variants as independent review. | Representative 200–300-case corpus and qualification metrics. The [executor guide](ai-evaluation-executor.md) describes the evidence and approval boundaries. |
| Assign an independent security/privacy reviewer and an advisory owner | Review the exact application/runtime revisions and staging evidence; provide findings and their disposition. For each remaining image advisory, record the accountable owner and an evidence-backed fix or acceptance with expiry. The [advisory register](upgrade-2026-image-advisories.json) has pending owner confirmation and a November 7, 2026 review deadline. | Independent security/privacy review and resolved or owned, expiring advisories. No acceptance is implied by the existing component exposure notes. |
| Qualify final official forms as they become available | Final published year/revision PDFs, authoritative hashes and line/field mapping review for each enabled scenario, plus the required independent signoff. The [source refresh](upgrade-2026-release-source-refresh.md) distinguishes available historical, draft and final forms. | Final physical maps and complete-data filing exports. Draft or historical mappings cannot be approved into a different year. |

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

The charity source-method investigation is still active in the
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
