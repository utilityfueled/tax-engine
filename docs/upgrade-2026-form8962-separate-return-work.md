# Form 8962 policy shared with a spouse on a separate return

Recorded November 1, 2026.

Every policy shared with a spouse on a separate return rejected. Form 8962 Allocation Situation 2 settles it, so a married filer who shared coverage had no route to a return.

## Rule

- Spouses married at year end who file separately and shared a policy allocate equally.
- With Exception 2 for domestic abuse or spousal abandonment, the filer enters 0.50 in columns e and g and leaves f blank. The SLCSP is not allocated: the filer enters the actual figure for their own coverage family on lines 12-23 column b, because the reported figure can be wrong for a smaller family.
- Exception 1 covers a married person who meets the Form 1040 head of household living-apart rules. They may file that way and take the credit, and Table 3 sends them to the same entries as Exception 2, with line A clear because that box is for Exception 2. The instructions' single form of Exception 1 is for Form 1040-NR, which this engine does not produce, so a single filer rejects.
- Without an exception the filer is not an applicable taxpayer. Only column g carries 0.50, line 24 is zero, and the allocated advance credit is repaid subject to the line 28 limit. Unlike the other allocation routes, this one has no premium or benchmark entry.
- A policy with no advance credit still allocates premium.

The checks: the route needs the year-end marriage, only the two spouse tax families on the policy, every covered person assigned, and both families covered in each month. Where the return names a spouse, the other taxpayer must be that person. The guide passes the separate-return spouse into this check only, so a mismatch shows in the section and no other Marketplace route sees the spouse.

## Limits

- A third tax family on the policy stays rejected. Pub 974 Worksheets E and F cover it, and this route has no way to verify it beyond the confirmation.
- A month where only one family is covered rejects. The instructions apply Situation 2 if the policy was shared at any time in the year, and name first and last months allocated, but do not address a month with one family, so a reviewer should confirm it.
- A second policy in an allocated month rejects, because the own-family benchmark would count twice.
- Self-employed health coordination rejects by name in `shared-marketplace-health.ts`.
- The own-family SLCSP is entered, not looked up. The instructions say no corrected Form 1095-A is needed, so a figure above the reported SLCSP needs a named source and the review copy says so. The first version rejected such a figure, which a review showed turned away correct returns: a wrong or stale statement, or a family spanning rating areas. Nothing proves the entered figure.
- A head of household return carries no spouse and no months-apart data, so Exception 1 rests on the filer's answers. An unrelated co-enrollee could be named as the spouse on two false answers. A reviewer should decide whether the return needs the spouse's identity here.
- The engine does not require a dependent for Exception 1, because a custodial parent who released a claim can still file as head of household without one.
- Monthly amounts round to whole dollars on lines 12-23, as on every allocation route. That reproduces whole-dollar months, but the instructions' annual examples are not divisible by 12, so they cannot be matched to the dollar. Their Nancy example gives 5,000 and 3,250, and months that total the same inputs give 5,004 and 3,252 here.
- Federal 2026 calculation stays incomplete, so this route is unreachable end to end for 2026.

## Independent review

An agent reviewed `83c9d29b` against `9b82ea7e` and rechecked its earlier findings. It found a single filer wrongly accepted for Exception 1 and the benchmark bound rejecting correct returns, both corrected, and the head of household identity limit above. A reviewer should confirm the 1040-NR wording. Report: `.local/upgrade-evidence/ai-2210-da-review/form-8962-separate-return-review-2.md`.

An agent reviewed `896c0213` against `cfc7d4ae`. It drove the real credits section with typed data through to a filled PDF for both cases, and an independent recompute of 286 seeded returns had no mismatches. Across 3,000 seeded inputs, no return calculated on both commits changed. It found the line A box never checked for Exception 2, a spouse pass-through that also unlocked an unrelated coverage-family route, no upper bound on the entered benchmark, and 12 surviving mutants, 11 of them real. All are corrected. Report: `.local/upgrade-evidence/ai-2210-da-review/form-8962-separate-return-review.md`.
