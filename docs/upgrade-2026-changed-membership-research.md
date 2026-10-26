# Changed filing-unit source contract

Official sources refreshed October 26, 2026. This is implementation research for
the existing finite charity/NOL queue, not completed calculation support or a
qualified human interpretation. The unchanged-membership guards remain in force
until the source contract, calculations, collectors and bound outputs are tested.

## Charitable carryovers

[Reg. 1.170A-10(d)(4)(i)](https://www.ecfr.gov/current/title-26/section-1.170A-10)
allocates the unused joint excess at the first separate-return year according to
each spouse's separately computed excess in the original contribution year.
Original donation ownership alone is not that ratio. The published historical
example has separate excesses of 12,000 and 8,000 and joint unused excess of
10,000 after intervening use: the allocated balances are 6,000 and 4,000.
Its 1970 percentage limits are historical, not 2025/2026 cash limits.

The same section requires later use to reduce each allocated balance before a
subsequent joint return aggregates the survivors. Paragraph (ii) also covers
separate-to-joint returns, newly married individuals and a remarried taxpayer's
properly allocated balance from the former marriage. Paragraph (iii) prevents
the surviving spouse from inheriting the deceased spouse's unused allocation
after the permitted final-return year.

Implementation therefore needs an actual membership timeline and source-bound
original joint and separate computations, rather than a current spouse checkbox
or a user-selected split. Keep contribution year, category, medium and each
person's identity through allocations and later use. Apply the contribution
year's actual law before deriving excess; amended category/floor questions
remain the separately documented interpretation items.

## NOL ownership and absorption

[Form 172 instructions, Change in Marital Status and Change in Filing Status](https://www.irs.gov/instructions/i172)
distinguish marriage changes from married spouses changing filing status. A
loss from before the current marriage cannot offset the new spouse's income.
Married separate-return losses can instead enter a later joint carry under the
stated rules. Joint-to-separate allocation first computes each spouse's loss
separately. If only one has a loss, that spouse receives the joint loss; if both
do, allocate the joint loss in proportion to those separate losses. The current
published example allocates a joint 5,000 using separate losses of 1,800 and
3,000, yielding 1,875 and 3,125. Its farming carryback illustrates allocation
arithmetic; it does not enable farming origins in this application's ordinary
carryforward contract.

[Reg. 1.172-7(d)–(e)](https://www.ecfr.gov/current/title-26/section-1.172-7)
requires separately attributed income and deductions for intervening joint
years, with the specified treatment of the other spouse's same-origin loss.
Recurrent separate/joint years retain that history. A final joint opening
balance and a present ownership percentage cannot reconstruct absorption.
Current statutory vintage, expiration and 80-percent limits still apply;
historical regulation examples do not replace those amendments.

## Required implementation controls

- Bind every original and intervening year to actual persons and membership,
  retaining former-spouse identity privately where needed. Reject duplicated,
  missing or contradictory years and changed identities with equal amounts.
- Reconcile original joint amounts and original separate source computations
  before deriving an allocation. Preserve zero and missing values distinctly;
  never assume equal ownership, current ownership, or unchanged marriage.
- Preserve charitable contribution year/category/medium and independent regular
  NOL/ATNOL ownership. Distinct source identities may share a year and must not be
  silently collapsed by the current unique-year or category keys.
- Derive current owner-income limits from complete canonical source ownership;
  an entered desired NOL deduction or final charitable allowance is not a fact.
- Cover separate-to-joint, joint-to-separate, a new spouse, recurrent filing
  changes, known-zero owner income, complete intervening use and death. Keep
  absent records as source requirements, not unsupported claims of an external
  legal blocker.
- Extend the actual guided collectors and original-bound private PDF context
  together with the calculation; then independently rederive original controls
  and reopen the saved output. Do not release the existing guards on a helper
  test alone.

The first generic search included stale drafts and third-party mirrors. They
were not used as authority. The current IRS instructions and official eCFR
sections above were opened directly; the eCFR pages reported Title 26 current
through October 22, 2026. No implementation or independent review is claimed by
this research note.
