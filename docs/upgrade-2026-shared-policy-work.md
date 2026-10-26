# Actual shared-policy allocations

Status: the first actual-source calculation and review-output method is implemented
and has passed bounded independent agent source review and isolated integration checks.
The guided collector follows this core package. This is not filing qualification,
and the full 2026 calculation and PDF gates remain closed.

The [final Form 8962 instructions](https://www.irs.gov/instructions/i8962),
Allocation Situation 4 and lines 30–34, permit two tax families to agree on an
allocation percentage that can change by month. The same percentage applies to
premium, SLCSP and advance-credit amounts in a month. Both zero and 100% are valid.
Part IV requires monthly Part II calculations, even with constant full-year amounts.
The two-page [final 2025 Form 8962](https://www.irs.gov/pub/irs-pdf/f8962.pdf),
created March 25, 2025, has been source-inspected for this review map. Its exact
SHA256 is recorded in the spec and template registry. Both sources were refreshed
October 25, 2026.

The optional source packet preserves actual original policy year, recipient,
covered people, coverage periods and monthly amounts. It binds each original
statement index to a complete immutable snapshot, the actual current return
household, the other taxpayer, every enrollee's tax family and every monthly
agreement. Missing identity, zero, year, agreement or family membership is never
inferred. Allocation math uses Decimal at original precision before existing
monthly form-dollar rules. Supplied reconciliation totals must equal the derived
allocation; they cannot override it. Original statements remain unchanged.

This first method covers documented Situation 4 agreements with two tax families,
positive policy APTC, confirmed no current-year marriage or divorce, a correct
original SLCSP and nonoverlapping policy months. No-agreement defaults, no-APTC
policies, current divorce, MFS, overlapping policies, alternate marriage, QSEHRA,
special lawful-presence rules and shared-policy self-employed-health coordination
remain specific internal source methods. Ordinary unshared policies combined with
shared policies also need their complete combined source method; this packet
currently requires all supplied policies to be represented in its ledger.

The Joe/Alice IRS example supplies independent allocated annual source totals:
13,000/12,000/6,345 at 80% gives 10,400/9,600/5,076, with the complementary
2,600/2,400/1,269 at 20%. The example's narrative credit is not used as a monthly
rounding oracle. Independently derived monthly controls use actual annual income
30,000 and original monthly 1,000/900/500 at 50%. In 2025, the monthly contribution
49 yields credit 401 each month, 4,812 annual credit, 3,000 advances and 1,812 net.
The isolated 2026 law calculation uses contribution 154 and annual credit 3,552;
actual income 100,000 instead yields no credit and full 3,000 advance repayment.

The physical review form contains actual monthly amounts and Part IV percentages,
last 15 policy characters, the correct line 34 branch and blank taxpayer SSNs.
The accompanying reference lists every allocation period and retains exact
original versus allocated monthly amounts. More than four periods continue in
that complete statement. A private opaque context validates the original whole
return before redaction and binds retained calculation and transfer audits. It
accepts only the exact original input or its identifier-redacted copy; missing,
forged or stale tokens cannot certify calculations. The web download prepares
this context before removing identifiers. Every page remains marked for review.

Initial verification: missing implementation and old allocation guard reproduced
red, followed by five core/source cases and root types. The PDF suite first failed
on the missing original context, then caught nested IRS widget path errors before
correction. Twelve current core/PDF/ordinary-reference tests pass, including an
independent pypdf reader, source immutability, twelve changing periods, exact cents,
unknown and contradictory facts, no output on stale audits, and private identifiers.
Final isolated tree ab5eda7ce2038d79310b6b99df9986578d4e2cb1 on committed
2d1b9bb passes 220 tests across 25 files, root/web/contracts types and all 4,817
spec references. Scoped lint has zero errors and 80 warnings, mostly non-null
assertions in the new tests. Two integration failures were reproduced and fixed:
the registered-template count now includes this 43rd blank, and the missing-source
error retains the existing worksheet expectation without weakening its guard.

The parent independently reopened the official instructions and final form and
passed 16 package/additional controls on reviewed tree 6e156144, including zero/full
agreements, original cents before rounding, redacted privacy, stale other-family
identity and duplicate sources. No actionable finding remained in this bounded
method. The final executable delta from that review is only the error wording.

Saved physical pages and the complete nine-page reference were rendered with
Cairo and inspected. The monthly/Part IV amounts, appearance streams, empty SSNs,
page breaks and review notices are visible; pypdf independently verifies each
page and field. A misleading image preview was resolved by inspecting the full
contact sheet and actual footer pixels, with no product change. Render evidence
is in the immutable review snapshot under `.local/shared-policy-visual/`.

Evidence lives under `.local/upgrade-evidence/shared-policy-*`. Rule metadata
2025.86 / 2026.82 is reserved for this core method; human/form qualification is
separate from the software and source checks recorded here.
