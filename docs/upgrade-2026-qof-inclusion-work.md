# QOF deferred gain inclusion

Deferred Qualified Opportunity Fund gain must enter income on the earlier of a sale or December 31, 2026, so every remaining pre-2027 investment reaches this rule in tax year 2026. The engine used to reject any known disposition. This package calculates an individual's complete investment.

## Rule

Sources were retrieved October 31, 2026 and are listed in `spec/federal/qof-deferred-gain-inclusion.yaml`. With remaining deferred gain R and a basis increase B of 10% of R at five years or 15% at seven:

- Corporation: `max(0, min(R, FMV) - B)`.
- Partnership or S corporation: `min(R - B, gain on a fully taxable disposition)`, floored at zero.

Holding periods are not tacked. Included gain keeps its short-term or long-term character and uses Form 8949 box C or F with code Y. Amounts invested after 2026 follow the Pub. L. 119-21 rule and reject here.

The regulation's example gives an independent check: a partner who deferred 200 and held seven years has a 30 basis increase and recognizes 170.

## Limits

- Partial dispositions, gifts, other inclusion events and any Form 8997 special gain code reject. Each row must state that no special code applies, because a section 1231 or collectibles deferral otherwise looks ordinary.
- A sale reports one row, so its term must match the deferred gain's character. Different terms reject. A partnership or S corporation sale must confirm all gain is capital, with no look-through character.
- "Basis before inclusion" excludes the 10% and 15% increases, which the calculation adds.
- The 2025 Form 8949 instructions give no row layout for an inclusion with no sale. Zero proceeds and basis with the included amount in column (g) yields the statutory amount, and final 2026 instructions must confirm it.
- No Form 8997 template or field map exists. The packet prints a reference page that says it is not Form 8997.
- A 2026 QOF record needs an explicit answer on gain held at year end. A return with no QOF record is not flagged. That is acceptable only while 2026 stays closed, and it needs a required answer before 2026 opens.
- State conformity is not established. Pennsylvania, Ohio and guided state previews stop instead of using or omitting the federal row. Some states did not conform, so they taxed this gain in the deferral year.
- Section 1411 treatment of gain deferred from non-investment activity has not been reviewed. The engine treats all included gain as net investment income.

The review PDF path stays closed for 2026 through the existing gate, so 2026 output is calculation only.

## Checks

The spec and tests preceded the runtime. The first run failed on the missing module (`.local/upgrade-evidence/qof-inclusion-initial-red.log`). Spec lines link to engine, Form 8949, Schedule D, review and guide tests, including an isolated 2026 return. This is not human tax qualification.

## Independent review

A separate agent reviewed `70f79573` and derived the amounts by hand. Amounts, the sale row, the term rule and flows to NIIT, AMT, the capital gain worksheet and carryovers all held. It found 13 issues in reporting and bindings, all corrected here. The two blockers were serious: a free-text broker label could silently delete the inclusion, and changed sale amounts still reached Form 8949 despite the spec saying they rejected. Report: `.local/upgrade-evidence/ai-qof-review/report.md`.

Corrections: rows are recognized by a derived flag that original records cannot set; a private digest binds every QOF fact and the derived rows before output; the Form 8949 token covers QOF facts; a sale needs a Yes answer; state paths stop; QOF capital counts in two capital guards; rows state that no special code applies; the guide uses the standard currency parser, so `100.000,00` no longer becomes 100; dates are real calendar dates; the basis increase rounds to cents; and reference text is printable and wraps. It also found test weaknesses, now tightened.
