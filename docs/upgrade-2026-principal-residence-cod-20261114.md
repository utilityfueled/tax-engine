# Original retained-residence canceled debt

A separate source method now derives the principal-residence exclusion from
actual secured acquisition debt and retained-home basis. It does not reuse the
unsecured personal-debt insolvency packet or require invented empty NOL history.
The first cohort has one wholly primary-owned retained home and one original
acquisition loan, with complete original identity, debt, use, cancellation reason,
known-zero interest and basis records. Refinancing, transfer, business/rental,
joint/community ownership and competing exclusions retain their separate gates.

[IRC §108(a)(1)(E) and (h)](https://uscode.house.gov/us/usc/119-124/t26/s108/)
and the [Form 982 instructions](https://www.irs.gov/instructions/i982) control the
debt cap, nonqualified-first allocation and residence-only basis reduction. An
800,000-dollar acquisition balance with 100,000 canceled has 50,000 nonqualified
debt above the 750,000 cap, leaving a 50,000 exclusion and 50,000 taxable amount.
Actual basis of 300,000 becomes 250,000; unrelated loss and credit attributes are
preserved. The MFS cap is 375,000. All source arithmetic uses Decimal.

For actual 2026 discharges the source validator requires an arrangement entered
and evidenced in writing before 2026, original dates/reference and confirmation
that this discharge is subject to it. This is a real statutory exception, not a
blanket expired-law rejection. The complete 2026 return calculation and filing
gates remain closed. A legacy asserted exclusion cannot replace actual sources.

The spec preceded meaningful public and actual HTTP failures on archived source.
Canonical/regression checks pass 621 tests across 18 files. After a separately
reproduced malformed-primary-SSN admission, the narrow identity successor passes
556 tests, root typecheck, lint and seven spec references. Prior broad/web checks
retain their exact source boundaries. Independent review verified the cap, basis,
MFS and precision controls, 30 missing/conflicting-source negatives, actual
HTTP/audit privacy and the identity successor.

Root's separate manual adjacent-cap test fails on archived `37f44952` and passes
with the patch: a 50.01 cancellation on a 750,001 balance excludes 49.01, leaves
1 taxable and basis 299,950.99. At a 750,000 balance it excludes 50.01 and leaves
basis 299,949.99. The initial root test referenced a nonexistent output property;
that failure is retained, then corrected to the actual reduction field with an
additional zero-unreduced assertion before rerunning identical RED/GREEN tests.

An isolated source assembled from `37f44952` plus only this package passes all
eight focused public/HTTP/manual tests. The separately owned Schedule AI import
and context hunks are excluded, proving this commit is independently usable.
No working-tree changes from the other package are discarded.

Private receipts:

- Author `IMPLEMENTATION-REVIEW-V2.json`, SHA-256
  `e5c79841a090a4e5acdafe98fdff2d05c4b34a015fcfe50f06b274c6f319dda7`.
- Independent source review `89eca415104f5822db8ed29ae0eec6bbd3600ce9f1233eae6e45dc7b7802c582`
  and identity successor `9c1a1d0be3d07f02dc6a5a3da16c5d0be86678cdc8a48f8eb686274ca3140711`.
- Root `nov14-qpr-independent/receipt.json`, SHA-256
  `b343506d9f71aef1969015f773df8a5165524298f44e251a17f8f9f7ebb0db11`;
  `split-source-review.json`, SHA-256
  `194d8f8dc444c985ffa8ff12f103e12bf96ad06aa7f2a2cad809d3a17bf9053c`.

Guided original entry is the next package. Combined checks and current runtime
artifacts must be refreshed. This is local engineering evidence, with no qualified
human opinion, final-form/export approval, model promotion or production action.
