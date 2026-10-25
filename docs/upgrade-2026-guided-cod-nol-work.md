# Guided canceled-debt and insolvency sources

This source collector exposes the bounded calculation committed in `bb5cbe6`.
It collects original Form 1099-C statements and complete immediately-before
insolvency records, then reuses the source-only canonical validator. Current
tax, regular and alternative NOL reductions, expiry and closing balances remain
calculated by the engine. No user-entered deduction or closing-balance override
is accepted.

The original statement ID is distinct from its internal array locator. Each
liability links to that original ID; removing or replacing a statement leaves
the conflicting link visible for correction. Amounts retain their original
cents. A blank box, source year, owner, list or confirmation remains unknown;
explicit zero and an explicitly empty asset list remain actual source facts.
Title 11, community property, basis-first elections and other exclusion methods
retain the canonical method boundaries.

The collector requires separate regular and AMT carry histories. A current-year
loss additionally requires the existing current-origin source packet and a
matching canceled-debt classification. Household and source edits revoke the
relevant source confirmations. Confirmation-only changes do not recursively
invalidate otherwise unchanged records.

Sources refreshed October 25, 2026:

- [Form 982 instructions](https://www.irs.gov/instructions/i982): actual
  insolvency exclusion, Part I and Part II loss-attribute reduction.
- [Publication 4681](https://www.irs.gov/publications/p4681): immediately-before
  asset and liability records, including assets protected from creditors.

Verification:

- Spec-first helper and DOM tests reproduced missing implementations, then six
  new cases passed. Canonical controls preserve the current `67,400` regular and
  `90,000` alternative deductions while a `40,000` exclusion reduces the
  respective closing carries to `92,600` and `70,000`.
- A separate current-origin control retains the original `80,000` regular and
  `75,000` alternative losses and reduces their closing balances by `1,000`.
- Immutable product tree `77e2b126a586685fb4cc96642affce0e0d52a6b1`, based on
  `59eae66`, passed 795 tests across 84 files, pinned Node24 root/web types,
  all 4,678 spec references and the production webpack build. Scoped lint has
  zero errors and two existing bridge non-null warnings. Logs are
  `guided-cod-nol-exact-{tests,types,web-types,spec,lint,build}.log`.
- Both production desktop/mobile cases passed against that exact build
  (`guided-cod-nol-browser.log`). Original cents and known zero survive reload;
  blank original boxes withdraw the estimate and revoke confirmations. Captured
  requests contain neither the tested private packet/statement identifiers nor
  the synthetic taxpayer ID. Both saved screenshots were inspected; the page
  has no horizontal overflow. The local test server was stopped afterward.
- The independent facts reviewer refreshed the official sources and passed
  11 tests across three files, including five private adversarial probes, with
  no actionable finding (`facts-review-guided-cod.log`). Probes covered reordered
  original statement links, replacement/duplicate events, incomplete liability
  sources, separate empty versus unknown AMT histories, exact amounts beyond
  JavaScript's safe integer range, special boxes and confirmation cycles. Those
  review-only probes are retained in the immutable archive, not product source.

This is source-intake implementation and software verification. It does not
open the 2026 full-return or filing gates or constitute independent human tax
qualification. Other cancellation exclusions and later-attribute methods remain
the explicit internal implementation queue described in the canonical COD
ledger.
