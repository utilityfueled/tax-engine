# QOF deferred gain inclusion

Deferred Qualified Opportunity Fund gain must enter income on the earlier of a sale or December 31, 2026, so every remaining pre-2027 investment reaches this rule in tax year 2026. The engine used to reject any known disposition. This package calculates an individual's complete investment.

## Rule

Sources were retrieved October 31, 2026 and are listed in `spec/federal/qof-deferred-gain-inclusion.yaml`. With remaining deferred gain R and a basis increase B of 10% of R at five years or 15% at seven:

- Corporation: `max(0, min(R, FMV) - B)`.
- Partnership or S corporation: `min(R - B, gain on a fully taxable disposition)`, floored at zero.

Holding periods are not tacked. Included gain keeps its short-term or long-term character and uses Form 8949 box C or F with code Y. Amounts invested after 2026 follow the Pub. L. 119-21 rule and reject here.

The regulation's example gives an independent check: a partner who deferred 200 and held seven years has a 30 basis increase and recognizes 170.

## Limits

- Partial dispositions, gifts, other inclusion events, special gain codes, section 1231, section 1256 and collectibles attributes reject explicitly.
- A sale reports one row, so its term must match the deferred gain's character. Different terms reject.
- The 2025 Form 8949 instructions give no row layout for an inclusion with no sale. Zero proceeds and basis with the included amount in column (g) yields the statutory amount, and final 2026 instructions must confirm it.
- No Form 8997 template or field map exists. The packet prints a reference page that says it is not Form 8997.
- A 2026 QOF record needs an explicit answer on gain held at year end. A return with no QOF record stays unanswered, as it was, so it is not forced into this path.
- State conformity is not established. Pennsylvania rejects these returns instead of guessing.

The review PDF path stays closed for 2026 through the existing gate, so 2026 output is calculation only.

## Checks

The spec and tests preceded the runtime. The first run failed on the missing module (`.local/upgrade-evidence/qof-inclusion-initial-red.log`). Spec lines link to engine, Form 8949, Schedule D, review and guide tests, including an isolated 2026 return. Review evidence follows at delivery. This is not human tax qualification.
