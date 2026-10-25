# Explicit 2026 nonitemization and current cash gifts

## Source and scope

The IRS [Publication 6196 (October 2026)](https://www.irs.gov/pub/irs-pdf/p6196.pdf) expressly permits the current cash charitable deduction for a taxpayer who does not itemize even when the standard deduction is unavailable. Its examples include a married taxpayer filing separately whose spouse itemizes. [IRC 170(p)](https://uscode.house.gov/us/usc/119-120/t26/s170/) separates this deduction from standard-deduction eligibility under section 63(c)(6). Sources were refreshed October 25, 2026.

This package adds the explicit `nonitemized` election for an actual 2026 taxpayer whose completed standard-deduction worksheet establishes ineligibility. The final result retains `deductionUsed: nonitemized` and zero standard/itemized deduction. The existing current-cash calculation supplies the separate section 170(p) deduction, with its $1,000/$2,000 cap and section 170(b)(1)(G)(i) percentage limitation. This election grants no standard deduction and does not infer any eligibility answer, donation date, recipient qualification or amount. Existing 2025 choices and automatic selection are preserved.

The guided collector requires the same actual ineligibility facts and donation sources, retains unknown answers, preserves saved itemized sources, and continues to require possible earlier-year mortgage recoveries. The review summary identifies the actual choice. Ohio receives the unchanged actual federal AGI; state-year support remains separate. The unmocked 2026 calculation and export gates remain closed, and the 2025 PDF entry points reject a forged nonitemized result before loading templates.

## Independent literal controls and red evidence

- Actual MFS, spouse itemizes, $75,000 AGI and a $1,500 eligible current cash gift: standard deduction $0, selected standard/itemized deduction $0, section 170(p) deduction $1,000 and taxable income $74,000. Selecting itemized instead gives $1,125 after the $375 itemized floor and no section 170(p) deduction.
- Supporting organization, donor-advised fund and explicitly unqualified recipient controls each give a $0 section 170(p) deduction. Unknown eligibility rejects. The source-only worksheet retains the $600 percentage cap at $1,000 contribution base and $1,500 current cash.
- The positive current-carry case is deliberately rejected at the new final-return boundary. The current itemized candidate would include its own floor increase, which is not an established nonitemizer carry method. Original amounts and histories remain unchanged; no positive balance is erased or declared resolved.
- A $16,500 preliminary itemized deduction at high income becomes a $16,100 standard choice under the existing automatic comparison after the section 68 limitation. The new single selection audit must contain that final $16,100, or the actual $15,608 limited deduction when itemizing is explicitly elected.

Meaningful failures were captured before implementation in `nonitemized-charity-core-red.log`, `nonitemized-charity-guide-red.log`, `nonitemized-charity-audit-red.log` and `nonitemized-charity-carry-boundary-red.log` under `.local/upgrade-evidence/`. The audit red reproduced $16,500 versus the final $16,100; the carry red reproduced acceptance of an unestablished positive carry. A test-only assertion against a nonexistent result field was corrected to use canonical Form 1040 line 14; no tax expectation was copied from implementation output.

## Verification

The isolated work copy based on `6cf0463` passes 1,839 tests across 128 files, including federal, charity, NOL, Form 172, foreign credit, AMT, Ohio-source, guided collectors, source DOM, PDF boundary and strict spec-reference checks. Root/web types, spec validation and the production build pass. Logs use the `nonitemized-charity-` prefix in `.local/upgrade-evidence/`.

Independent review, final immutable verification, desktop/mobile saved-source browser results and commit identity will be recorded below when complete. No human tax review or filing qualification is claimed.

## Remaining methods

This bounded election does not complete 2026 positive current/prior charitable carry and floor coordination or the new election's NOL/Form 172 transition. Those methods retain explicit guards. Partial same-category cash/property carry attribution, actual prior/mixed regular and AMT charitable-NOL histories, and the 2026 carry transition remain separate internal work. Existing current sources and earlier-year records remain available for those methods.

## Exact review and delivery evidence

Frozen tree `78eafef141a475c8da1a38b797f508dc32c22cc1` on `19450f5` passed 1,845 tests across 130 files, root/web/contracts typechecks, spec validation and a production build. Scoped lint had zero errors and nine existing warnings in adjacent files. Production-browser desktop and mobile cases passed 2/2 with zero retries against this exact build; both screenshots were visually inspected. Tests preserve the explicit election, unknown answers, exact donation cents, saved itemized sources, private-source transmission boundary and closed 2026 estimate gate. Logs use `nonitemized-charity-exact-` in `.local/upgrade-evidence/`.

Federal independently refreshed Publication 6196 and section 170(p), read the election, guide, PDF and downstream AMT/foreign context, and passed ten tests across six files, including three additional controls. Actual $600,000 income retains $599,000 AMTI with no standard or SALT addback despite $20,000 property tax; $999.49/$999.50/known-zero gifts retain exact input cents and report $999/$1,000/$0; changed actual short-year ineligibility rejects. The initial reviewer-only high-income fixture required explicit synthetic estimated-tax facts; the rerun supplied actual synthetic withholding without changing product code. No actionable finding remained. Log: `federal-review-nonitemized-charity-probes.log`. This is agent software/source review, not independent human tax or filing qualification.

The delivery rebase preserves the committed Marketplace re-entry, adoption PDF and educator source changes. Metadata advances to 2025.84/2026.80-law-integration-draft with current Publication 6196 and statutory provenance; all calculation/export qualification gates remain unchanged. Positive carry and NOL methods are still separately recorded internal work.

Final delivery tree `9dd270899bdce88c5dbde400c6e427ac0a67fc28` rebased on `08214b9` passes the same 1,845 tests/130 files, all three typechecks, all spec references, scoped lint (zero errors, nine existing warnings), production build and two production-browser cases (zero retries). The adoption PDF preparation context is preserved; the only rebase adjustment places the unchanged nonitemized guard immediately after the export policy check. Final logs use `nonitemized-charity-final-`. This paragraph is the only post-check tree change.
