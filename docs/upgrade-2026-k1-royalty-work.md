# K-1 portfolio royalty classification

Partner K-1 Box 7 and shareholder K-1 Box 6 royalties belong in Schedule E
Part I. The previous calculation added them to the ordinary Part II activity
before its limitations. A passive loss of 10,000 and portfolio royalties of
12,000 therefore reported only 2,000, improperly using the royalties to release
ordinary passive losses. With 2,000 wages, that understated AGI as 4,000 instead
of 14,000 and incorrectly allowed EIC.

The [partner K-1 instructions](https://www.irs.gov/instructions/i1065sk1),
Portfolio Income and Box 7; [shareholder instructions](https://www.irs.gov/instructions/i1120ssk),
Portfolio Income and Box 6; and [Form 8582 instructions](https://www.irs.gov/instructions/i8582),
portfolio exclusions, were refreshed on 2026-10-26. Royalties still increase
basis in the unchanged basis worksheet. Part II activity income/loss proceeds
through basis and at-risk limits while retaining its separate reporting character.
The result exposes the royalty subtotal for subsequent character worksheets.

Specs preceded five red cases. The first implementation passes four, with the
remaining test incorrectly expecting the existing signed Schedule E carryover
as a positive value. Correcting that test's sign preserves the 10,000 loss; the
canonical Form 8582 assertion still checks its positive suspended-loss total.
Four existing tests encoded the old Part II classification. They now assert the
correct Part I and Part II amounts plus the conserved combined totals. No test,
coverage threshold or gate was removed. Spec validation also found the old Box 7
cross-reference; its destination and reference are corrected.

The focused/adjacent run passes 375 tests in seven files. Root and web types,
5,103 spec references and scoped lint pass, with zero errors and 35 existing
warnings. A separate canonical/PDF run passes 508 tests in four files. Its first
command also named a nonexistent passive-ordering path; that path supplies no
evidence. Exact logs are `.local/upgrade-evidence/k1-royalty-{red,green,adjacent,static,static-final,integration-private}.log`.

Separate review of the first frozen tree `4baf397` reproduced two actual
Form 6198 income-offset failures: a 10,000 ordinary loss with 12,000 same-activity
royalties and 1,000 capacity incorrectly allowed only 1,000; the 4,600 loss,
3,100 income and 600 capacity example incorrectly omitted its income offset.
The reviewer retained both failures after correcting one unrelated cents-control
assertion (41 passes, two failures). The [Form 6198 instructions](https://www.irs.gov/instructions/i6198),
lines 3, 5 and 7, refreshed 2026-10-26, distinguish the income offset from the
remaining excess-loss limit. Portfolio exclusion under section 469 does not
determine section 465 activity membership.

Specs and two failing regressions precede the repair. Complete supplied Form
6198 amounts now reconcile the basis-allowed current ordinary loss and either
the full actual same-activity royalty amount or explicit zero. The loss
allowance includes confirmed income before applying the remaining risk capacity.
All eight monetary source amounts retain absence through parsing and must be
known for this method. Extra loss/gain categories, prior basis losses, mismatched
amounts and recapture require their separate source methods. Manual at-risk
capacity remains a legacy input and provides no royalty-allocation qualification.
The royalty remains fully reported in Part I and cannot release passive losses.

The repaired cohort passes 384 tests in 16 files, root/web types and 5,105 literal
spec references. New tests verify source absence, explicit zero, basis-first
amounts, the two literal review examples and passive separation. Logs use
`.local/upgrade-evidence/k1-royalty-review-repair-{red,green}.log` and
`k1-royalty-repair-{adjacent,types,web-types,spec,lint}.log`. The revised independent
review and final integration are pending; the initial failure is not hidden.

Separate agent re-review of revised `d2e6ba1` verifies all nine owned hashes and
passes 48 tests in four files. Both original failed probes pass unchanged.
Three further private controls check exact-cent same/separate-activity outcomes,
all eight source omissions versus explicit zero, and sequential basis/at-risk
conservation: 6,000.41 basis-allowed loss, 5,250.27 allowed activity loss, 750.14
at-risk suspension and 3,000.40 basis suspension. The reviewer refreshed the
controlling sources and found no further issue in this bounded method. The
original failed candidate and logs are retained. Evidence is
`.local/upgrade-evidence/ai-k1-royalty-repair-review-verification.json` and its
linked review logs. This is separate software/source review, not human tax
qualification.

The source starts at `cfe5516`; integration is onto `0799088` with metadata
`2025.119` / `2026.116-law-integration-draft`. No readiness status changes.
Final integration passes 269 tests in 11 files, root/web types and 5,148 literal
spec references. Seven non-model/non-ledger blobs match the reviewed freeze;
the exact Form6198 schema block matches while intervening input changes remain
intact. Both independent-review log hashes are verified. Scoped lint retains
35 existing warnings and no errors. Final logs are
`.local/upgrade-evidence/k1-royalty-final-{integration,web-types}.log`.
No royalty expenses, depletion or royalty-property identifiers are invented.
Existing aggregate review PDF checks are bounded to their actual mappings;
complete property detail and final-form qualification remain separate work.
