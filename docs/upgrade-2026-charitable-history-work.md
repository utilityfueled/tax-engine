# Actual charitable carry history and current gift sources

This package replaces the prior aggregate-to-cash fallback with actual category,
vintage, contribution medium, filed-history and return-identity sources. It
implements the supported 2025 public cash, public ordinary/capital property and
private-category carry methods, including current-category priority, FIFO,
fifth-year expiration and standard-year absorption. Current gifts in both years
must have an actual payment date in the return year and known recipient
qualification. Known ineligible gifts remain in the original input but do not
create a deduction or carry.

## Controlling sources and literal checks

- [Publication 526](https://www.irs.gov/publications/p526), refreshed October 25,
  2026: published carry examples give 10,500 for 9,500 current public cash plus
  1,000 prior cash at a 20,000 base; and 12,000 for 6,000 current public cash,
  3,000 current private cash and 5,000 prior public capital property at a 24,000
  base, leaving 2,000 of current private cash.
- [26 CFR 1.170A-10](https://www.ecfr.gov/current/title-26/section-1.170A-10):
  current capital property is limited to 30% before the public carry capacity
  reservation; at a 50,000 base, 40,000 current capital property plus 10,000 prior
  ordinary property allows 15,000 plus 10,000. Standard-year treated-paid amounts
  remain distinct from the actual deduction.
- [IRC 170](https://uscode.house.gov/us/usc/119-120/t26/s170/): current statutory
  cash/private carry rules supersede the older regulation's historical cash
  ceiling and no-private-carry language. No priority is invented for a binding
  modern cash/property method that this package does not yet implement.

Exact intermediate money is retained. The Schedule A candidate reports current
cash on 11, current property on 12 and all actual prior use on 13. A separate
selected-return result records zero actual prior deduction in a 2025 standard
year while retaining the legally treated-paid absorption. Saved legacy balances
can reconcile against complete actual source history; they never establish a
missing category, origin year or filing-unit history.

## Verification and independent review

Spec-linked failures preceded the source, qualification, history, selection,
privacy and PDF changes. The working-tree broad cohort reached 3,651 passing
tests with two earlier error-message expectations, then the corrected 71-test
cohort passed. The separate privacy cohort passed 15 tests across eight files,
including ordinary NOL, current loss, positive QSBS, COD and alternative charity
review paths. Final immutable evidence is recorded below after completion.

Federal agent independently reviewed the frozen initial helper against the
official sources: eight package cases and three independent controls passed,
covering capped current-property reservation, multiple prior ordinary vintages,
public-before-private priority and standard-year absorption. Evidence is
`federal-charity-history-review.log` and `federal-charity-history-probes.log` in
the local upgrade evidence directory. Those private reviewer probes are not
product tests. This is agent source/software review, not human tax qualification.

Synthetic fixture repairs add explicit known qualified/public recipients and
actual payment dates. Prior public-cash fixture histories state their actual
synthetic origin, zero intervening uses and identity; product parsing supplies
none of these defaults. Unknown and false regressions remain active. Render-only
copies clear taxpayer-ID-last-four suffixes; original encrypted-source facts and
prepared source validation remain intact.

## Finite follow-through

1. Actual prior-history collector, canonical identity/history validation and
   confirmation invalidation, including a migration path that preserves old
   unknown records.
2. 2026 category floor and nonitemizer carry treatment; no 2026 readiness gate is
   changed by the present 2025 carry implementation.
3. Actual prior/mixed regular and alternative NOL/charity coordination, with
   separate original histories and no copied AMT assumptions.
4. Binding prior public-cash/current-property ordering, mixed cash/noncash
   sources of the same origin/category, changed filing units, conservation and
   special elections require their separate supported source methods. A complete
   source packet alone does not establish an unimplemented tax method.

These are internal implementation boundaries, not substitutes for external human
qualification. Live provider measurements, filing-form qualification and release
approval remain separately evidenced.

## Corrections from independent core review

The first immutable core review (7dac725b) reproduced five defects: current
private cash used the public cash ceiling, ordinary property omitted its basis
reduction, unknown ordinary basis was accepted in 2025, an empty history changed
current category arithmetic, and the render path did not bind the original
identity suffix. That snapshot is superseded and is not qualification evidence.

The corrected implementation routes every current gift through the same
category/valuation worksheet, requires actual holding/basis/qualified-stock
facts, and validates original history before creating a server-local opaque
review context. Only the exact original or exact fully redacted source copy can
use that context. Packet and workspace forwarding preserve the existing capital
and COD contexts. Original source records remain unchanged.

The five findings were reproduced in owned source/privacy regressions before
the fixes (`charity-history-parent-findings-red.log`). The subsequent focused
208-test cohort passed (`charity-history-oracles-green.log`). Broader old direct
fixtures also exposed a redundant optional-array access; the existing early
legacy-source guard already enforces the same boundary, so the duplicate access
was removed without manufacturing a source array.

Final 2025 Publication526 Worksheet2 considers public cash before property.
Old property-first current-only assertions were corrected using its printed
lines13/17/30 and explicit carry conservation. These changes preserve the
physical total where the earlier wrong allocation happened to have that total:

| Base | Current cash / ordinary / capital | Old allowed cash / property | Correct allowed cash / property | Carry |
| --- | --- | --- | --- | --- |
| 200000 | 130000 / 0 / 80000 | 60000 / 60000 | 120000 / 0 | 90000 |
| 100000 | 70000 / 60000 / 40000 | 10000 / 50000 | 60000 / 0 | 110000 |
| 200000 MFJ | 150000 / 0 / 80000 | 60000 / 60000 | 120000 / 0 | 110000 |
| 1000000 | 800000 / 0 / 500000 | 300000 / 300000 | 600000 / 0 | 700000 |
| 100000 HoH | 75000 / 0 / 45000 | 30000 / 30000 | 60000 / 0 | 60000 |
| 5000000 | 3500000 / 0 / 2000000 | 1500000 / 1500000 | 3000000 / 0 | 2500000 |
| 80000 | 50000 / 0 / 25000 | 24000 / 24000 | 48000 / 0 | 27000 |
| 150000 MFS | 100000 / 0 / 50000 | 45000 / 45000 | 90000 / 0 | 60000 |
| 120000 | 80000 / 55000 / 0 | 17000 / 55000 | 72000 / 0 | 63000 |
| 50000 | 120000 / 105000 / 110000 | 5000 / 25000 | 30000 / 0 | 305000 |
| 100000 | 60000 / 50000 / 30000 | 10000 / 50000 | 60000 / 0 | 80000 |
| 100000 | 70000 / 0 / 40000 | 30000 / 30000 | 60000 / 0 | 50000 |

The private-foundation FMV stock fixtures now explicitly state their synthetic
qualified-appreciated-stock fact. Missing/false qualification remains tested.
The ordinary-property NOL unsupported-method fixture now states its actual
holding/basis so it reaches that distinct method boundary.

## Revised immutable core evidence

The revised tree `21386bbc446dd75d8028721eaaa38169662c692b` on `907b6db`
passed all 3,662 tests in the 81-file affected cohort, root and web typechecks,
4,703 spec references, and scoped lint with zero errors (526 warnings in the
existing affected files). Logs use the `charity-history-21386-` prefix. The parent
reran the unchanged five original probes plus source/PDF cases (11 tests across
three files) and inspected the original/redacted context, with no remaining
blocking finding in this bounded core. The reviewer-only probe file is not part
of the product tree. This is independent agent software/source review, not human
tax qualification.

A saved packet from the actual 24,000-AGI synthetic source was reopened and
rendered: ScheduleA11=7,000,13=5,000,14/17=12,000, identifier blank, and one
visible red review notice. Evidence is `charitable-history-pdf/` including its
reopened JSON and PNG. The first renderer attempt lacked a writable font cache;
rerunning with the existing workspace font configuration produced the inspected
image. The exact packet forwarding test also passes. The existing physical18
itemization-election checkbox omission discovered in that render is a separate
narrow mapper follow-up, not a claim of whole-form qualification.

Remaining same-origin `other_30` cash/noncash histories currently reject a
second year/category record even though current results can retain both media.
That source allocation method stays explicitly on the next-method list, together
with binding prior-G/current-property, 2026 floor/nonitemizer and prior/mixed
NOL coordination. No values or methods are fabricated to bypass those limits.
