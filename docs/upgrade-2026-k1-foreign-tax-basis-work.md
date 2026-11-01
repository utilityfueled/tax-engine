# K-1 foreign tax in the basis schedule

Recorded November 1, 2026.

The basis schedule ignored K-1 foreign tax. Ending basis came out too high by the tax, and where basis ran short, losses were allowed too much because foreign tax took no share of it.

## Rule

- IRC 704(d)(3)(A) takes a partner's section 901 taxes, the IRC 702(a)(6) amounts, into account in the loss limit. The Partner's Instructions say the same under Basis Limitations, and their Part II gives foreign taxes line 15d and allocates a shortfall pro rata across categories.
- Form 7203 (Rev. December 2022) lists foreign taxes on Part III line 46 with the loss and deduction items, so for a shareholder they follow distributions and nondeductible costs and can use debt basis. The Shareholder's Instructions report box 16 code F on Form 7203 line 46.
- Foreign tax is now a loss category, so it lowers ending basis and shares a short basis pro rata.

## Limits

- Any basis shortfall on a K-1 with foreign tax rejects by name, even when pro rata would suspend only a small part of the tax. No source reviewed says which year a suspended tax counts as paid when it is later allowed, or how the allowed part maps to Form 1116 or the election, so this is listed as a Ruling.
- The test reads the shortfall, not the suspended foreign tax amount, because legacy dollar rounding can move a small suspension onto another category.
- This can reject a return that used to calculate. Those returns claimed the full tax and allowed losses too high.
- There is no prior-year suspended foreign tax input. A suspended amount can only appear in the basis schedule's own result.
- A K-1 with no beginning basis computes no basis schedule, as before.
- Form 7203 has no separate filled form here. The review copy of the basis schedule shows foreign tax inside total losses and deductions.
- Form 6198 at-risk treatment of foreign tax was not reviewed and is unchanged.
- The Shareholder's Instructions say not to use box 16 code F to complete Form 1116, and to see Schedule K-3. The engine has one foreign tax field for both, so a filer needs the same amount in each. A reviewer should confirm that.
- The order under an IRC 1367 election with foreign tax has no test and no source reviewed.
- The Form 7203 instructions page does not discuss line 46, so debt basis rests on the form's general column (d) rule.
- `k1-charitable-return-sources.ts` reads `totalAllowedLosses` for its at-risk check. Charitable sources reject positive foreign tax first, so this is unreachable now, but lifting that rejection would inflate the check.
- A K-1 with a basis shortfall and a foreign tax error reports the suspended foreign tax first.

## Independent review

An agent reviewed `787150f0` against `7aa964e4`. Across 1,499 seeded K-1s, all 591 with zero tax and all 147 with no beginning basis were identical. With tax and a beginning basis, 242 of 671 newly rejected, on a seed weighted toward shortfalls, and no accepted case changed AGI, tax or a credit. It found the rounding dependence and the test gaps above, now corrected. Report: `.local/upgrade-evidence/ai-2210-da-review/k1-foreign-tax-basis-review.md`.
