# EIC tie-breakers

Recorded November 1, 2026.

The actual child-source routes, used by Form 8862 and separated-spouse claims, rejected a married child and any competing claimant when the filer was not the child's parent.

## Rule

- A married child qualifies only if the filer can claim the child as a dependent, or could but released the claim to the other parent. The joint-return test still applies.
- A parent who claims the child takes it. A parent who does not claim needs a filer AGI above that parent's, under IRC 152(c)(4)(C), which compares parents only. Among nonparents who claim, the highest AGI takes the child. A nonparent who claims nothing has no effect.
- A filer who loses the child is left with no qualifying child and may still claim the credit without one, if otherwise eligible. The child belongs to the other person for all five shared benefits, so a CTC, ODC or head-of-household use of that child rejects. A married child the filer cannot claim, or released to the other parent, rejects with a CTC or ODC answer.
- Only a biological or adoptive parent is a parent here. A stepparent or foster parent follows the nonparent rule, as Pub 596 defines it.

## Limits

- No IRS source reviewed says how to compare AGI on a joint return, or who wins at equal AGI. Both reject for a reviewer.
- A parent at or above the filer's AGI who does not claim also rejects for a reviewer. IRC 152(c)(4)(C) bars the filer, while Pub 596 Rule 9 lets a filer use a child the other person cannot claim for the EIC.
- The filer's AGI is entered on the child record and must match Form 1040 line 11, because these source functions run in the guide before AGI exists.
- A parent filer keeps the existing rule, so a competing claim by another person still rejects.
- The default EIC route reads the dependent's `qualifiesForEIC` flag and is unchanged.

## Independent review

A fresh agent reviewed `ccd47e86`. A real comparison with `5dc80894` over 1,500 seeded inputs per route showed no existing return calculating differently; every change involved the new fields. It found that a filer who lost a child kept that child's CTC, ODC and head-of-household status, and that my order compared every claimant's AGI, which contradicted IRC 152(c)(4)(C). One test had encoded that mistake. Both are corrected, along with unchecked dependent answers, commas in the Form 8862 guide flow and a filer AGI that could not be cleared. Report: `.local/upgrade-evidence/ai-2210-da-review/eic-tiebreaker-review.md`.
