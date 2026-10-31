# Chapter 13 discharges

Recorded October 31, 2026.

A guide filer whose debt was discharged in bankruptcy could only answer No, because any Yes rejected. Chapter 13 now has a route.

## Rule

- A discharge in a title 11 case is excluded in full. The insolvency limit does not apply, so a solvent debtor also excludes it.
- Form 982 line 1a is reported instead of line 1b.
- Attributes reduce in the same order as insolvency.
- IRC 1017(c)(1) bars basis reduction on property the debtor treats as exempt, for the title 11 exclusion only, so each following-year property answers that question. Any exclusion left over is reported as unreduced.
- The debtor must be under the court's jurisdiction, and the court must grant the discharge or it must follow an approved plan.
- The statement must show event code A, and code A rejects outside title 11.

## Limits

- IRC 1398 applies to chapters 7 and 11, where a separate bankruptcy estate takes the debtor's attributes and hands them back at termination. Those returns stay rejected with a named message because the attributes on the debtor's return are not the debtor's during the case. Chapter 12 has no separate estate under IRC 1399, so rejecting it is a scope choice: its farm provisions are not reviewed here.
- The asset and liability worksheet is still required, because the line 10a basis limit reads liabilities immediately after the discharge. It no longer limits the exclusion. Only its liabilities side is needed for that limit, so the asset side is an extra requirement of this route, not of the law.
- Creditors generally need not report a consumer discharge in bankruptcy, so this route covers a discharge shown on a statement. A discharge with no statement has no source here.
- The route keeps the existing one-event, continuing-individual and noncommunity contract.
- Direct `codExclusion.bankruptcy` input with no source records keeps its older path, which has no chapter, court or event-code gates. The guide always builds sources.

## Independent review

A separate agent reviewed `6346e9ec`. The exclusion, attribute order, line 10a limit and interest handling held, and 3,000 seeded insolvency returns were unchanged from `74f3994e`: 2,175 identical results, 651 identical errors, 174 with different error text for the same rejection, and no different result. It found that exempt property was not protected and that the NOL statement named line 1b. Both are corrected. Report: `.local/upgrade-evidence/ai-cod-delivery-review/title-11-review.md`.
