# EIC tie-breakers

Recorded November 1, 2026.

The actual child-source routes, used by Form 8862 and separated-spouse claims, rejected a married child and any competing claimant when the filer was not the child's parent.

## Rule

- A married child qualifies only if the filer can claim the child as a dependent, or could but released the claim to the other parent. The joint-return test still applies.
- A parent who claims the child takes it. A parent who may claim but does not leaves the child only with a filer whose AGI exceeds every parent's. With no parent, the highest AGI takes the child.
- A filer who loses the child is left with no qualifying child and may still claim the credit without one, if otherwise eligible.

## Limits

- No IRS source reviewed says how to compare AGI on a joint return, or who wins at equal AGI. Both reject for a reviewer.
- The filer's AGI is entered on the child record and must match Form 1040 line 11, because these source functions run in the guide before AGI exists.
- A parent filer keeps the existing rule, so a competing claim by another person still rejects.
- The default EIC route reads the dependent's `qualifiesForEIC` flag and is unchanged.
