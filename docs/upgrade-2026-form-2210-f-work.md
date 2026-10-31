# Form 2210-F and waiver requests

Farmers, fishers and waiver requests were rejected. This package calculates Form 2210-F and records Form 2210 waiver requests. It also removes the Schedule D dead end for corrected digital rows.

## Rule

Form 2210-F (2025) sets the method: two-thirds of current tax using the printed 0.667, or 100% of prior tax with no 110% rule, paid by one date, January 15. The penalty counts days from that date to payment or April 15 at 7%. Filing and paying by March 2, 2026 removes it.

A waiver is a request. Box A asks for all of the penalty and box B for part of it, each with a reason and a statement. The return reports the reduced penalty, and the packet warns that the IRS decides.

## Limits

- The form has one payment date, so an underpayment needing two late payments rejects.
- 2026 has no published rate for early 2027, so a 2026 penalty rejects.
- No Form 2210-F PDF map exists.
- Section 1062 farmland elections and Form 4136 fuel credits on line 4 are not modeled.
- Federally declared disasters stay rejected, because the IRS applies that relief itself.
- Business state refunds on Form 1099-G stay rejected. The sources define Box 8 but give the recipient no reporting rule, so this moved to the Ruling class.

## Independent review

A separate agent reviewed `33b08c4d`. The arithmetic held across 7,544 random cases against an exact-fraction check, and regular Form 2210 behavior was unchanged across 20,000. It still found 11 problems. The worst: the farmer path skipped every source gate, and the March 2 exception never checked that the tax was paid, so a return showing the whole tax unpaid dropped its penalty. All are corrected, including a guide that used the wrong date for farmers, a crash on a comma in a selling cost, readiness that called a full-waiver packet complete, and a waiver checked against a first-pass penalty. Report: `.local/upgrade-evidence/ai-2210-da-review/form-2210-f-report.md`.

## Checks

Expected amounts were derived before the code and recomputed with exact fractions: 61.37 at 64 days and 86.30 at 90 days. This is not human tax qualification.
