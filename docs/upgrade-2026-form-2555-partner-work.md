# Form 2555 partner income and foreign QBI

Recorded November 1, 2026.

Foreign earned income from a partnership rejected outright. Review of that work also found a bug in the delivered Schedule C path: foreign profit stayed in QBI, so a filer took a 20% deduction on income that is not QBI.

## Rule

- A `scheduleK1:i` row binds to that statement's owner, year, name and EIN, and reports on Form 2555 line 20b.
- Receipts cannot exceed Box 14 code A, which reports earnings from active service. It is a net figure and can be lower than the partner's gross share, as in the Pub 54 partner example, so the ceiling can reject and cannot overstate.
- The partner confirms performing the services in a foreign country, and answers whether capital was a material income-producing factor.
- Where capital is material, Reg. 1.911-3(b)(2) limits earned income to a reasonable allowance for the services, and to 30% of the partner's share of net profits. The Form 2555 instructions apply the 30% after the employer-equivalent self-employment deduction, which Pub 54 Example 3 does not show, so the code takes the stricter instructions. Guaranteed payments count in the share, also the stricter reading. All the foreign profit stays outside QBI, not only the earned part.
- QBI excludes income not effectively connected with a U.S. trade or business, whether or not the income is excluded. Schedule C foreign profit is computed as net profit times foreign receipts over gross income, the Pub 54 ratio, so a filer enters nothing. A K-1 row enters the profit from those services inside its QBI, and zero with positive K-1 QBI needs confirmation that the statement already omits it.
- The reduction comes before the deductions that lower QBI, and only the U.S. share of the self-employment tax deduction lowers QBI. All-foreign profit gives QBI of zero and no loss carryforward.
- Pub 54 makes the self-employment tax deduction allocable to excluded income. The entered allocable deductions must reach the foreign share of the deduction times the exclusion over foreign earned income, and the error names the amount. The housing exclusion stays out of that ratio because Pub 54 does not name it.
- Excluded income does not reduce self-employment tax.

## Limits

- Schedule C with capital as a material factor works for a business whose income is all foreign. The filer enters the earned part with its allowance, the 30% limit reads the whole net profit after the self-employment deduction, and all the profit leaves QBI. A mixed U.S. and foreign business rejects, because the instructions read the limit on net profits from the trade or business and do not say how a foreign share applies.
- The allocable floor on Schedule C now also charges business expenses: expenses times the exclusion over gross income, the fraction in Pub 54 Examples 3 and 5. A review found the engine accepted entries that left those expenses deductible, which understated tax on every foreign Schedule C return, not only capital ones. This can reject returns that used to calculate. The floor stops at the exclusion, because allocable deductions cannot exceed it.
- Pub 54 gives no ratio for the self-employment deduction where capital is material. The engine reads the exclusion over the whole net profit, the higher of the readings considered, and a reviewer should confirm it. The partner route has no gross-income or expense figure, so it charges no expenses and keeps the exclusion over earned income.
- The 30% limit follows the Form 2555 instructions, after the self-employment deduction, so a filer at Pub 54 Example 3's own 16,244 rejects at 15,096. Reg. 1.911-3(b)(2) says only net profits.
- A business with capital material and no net profit rejects by name. Pub 54 Example 4 lets the allowance stand, but how a foreign loss leaves QBI is unsettled.
- A net loss rejects on the Box 14 code A ceiling, though Pub 54 Example 4 lets a reasonable allowance stand with no 30% limit.
- Prior-year partnership services reject.
- A K-1's foreign profit is entered, because the statement decides what sits in its QBI. K-1 or Schedule C W-2 wages or UBIA with a positive reduction reject, because they would need apportioning.
- Health insurance and retirement deductions stay charged in full against U.S. QBI. No source reviewed says whether they follow the foreign share, so this is a reviewer question.
- Existing Schedule C foreign returns can now reject when the entered allocable deductions fall below the self-employment floor. Across 1,500 seeded returns, 636 rejected this way, each confirmed against an independent formula, and they were previously accepted with too low an AGI.
- The Schedule C ratio applies expenses evenly. A filer who can trace expenses to foreign or U.S. work has no separate entry.
- Box 14 code A cannot prove source or passive status. The confirmations carry that.
- Schedule 1-A business tips with foreign Schedule C profit reject with a named message, because the tip limit reads full business profit.
- State treatment of the exclusion was not reviewed, and no state engine reads Form 2555.

## Independent review

An agent reviewed `6f53f58e` against `00930447`, and reproduced Pub 54's figures. Across 900 seeded returns with four allocable values, all 2,128 evaluations with no capital flag on a Schedule C row were identical and no tax fell. It found the missing expense charge, a floor that fell too low with large expenses, misleading loss and stale-flag behavior, and 12 surviving mutants, and these are corrected except a likely-equivalent pair and the rounding of the printed amount at the limit. Report: `.local/upgrade-evidence/ai-2210-da-review/form-2555-business-capital-review.md`.

An agent reviewed `8192d5ca`. It found the QBI gap, the unallocated self-employment deduction, a dependent care name match that rejected different people sharing a name, and a guide that hid K-1 errors. All are corrected. A real comparison with `40efdeef` over 2,000 seeded inputs left all 471 returns with no partnership row identical. Report: `.local/upgrade-evidence/ai-2210-da-review/form-2555-partner-review.md`. A first fix reduced QBI after the deduction step, which removed the foreign share of the self-employment deduction twice, created a false loss for all-foreign income, and required an entry from every existing Schedule C return. A recheck caught all three, and the current design replaced it. Report: `.local/upgrade-evidence/ai-2210-da-review/form-2555-partner-recheck.md`.
