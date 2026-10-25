# Independent AMT loss and current charitable carry

Status: bounded implementation verified on an immutable source tree, with
independent agent source review. This is not human tax review, filing
qualification, or release readiness.

## Controlling sources and method

Refreshed 2026-10-25:

- [IRC170](https://uscode.house.gov/us/usc/119-118/t26/s170/), especially
  (b)(1)(G), (d)(1)(B) and the 2026 floor ordering in (d)(1)(C).
- [IRC56](https://uscode.house.gov/us/usc/119-118/t26/s56/), (a)(4) and (d):
  the independent alternative NOL and modified-income limitation.
- [Reg1.55-1](https://www.ecfr.gov/current/title-26/section-1.55-1): regular
  AGI remains the basis of an individual's AMT charitable percentage limit.
- [Reg1.172-5](https://www.ecfr.gov/current/title-26/section-1.172-5) and
  [Reg1.170A-10](https://www.ecfr.gov/current/title-26/section-1.170A-10):
  recompute modified-income percentage deductions and measure succeeding
  carry increases, including expiration. Historical regulation rates are not
  imported into current-year calculations.
- [2025 i6251](https://www.irs.gov/instructions/i6251), line2f and recordkeeping:
  keep the alternative loss history and calculation separate.

The counterfactual removes current excess **source gifts** only in the modified
AMTI replay. It keeps the actual regular NOL deduction in regular AGI and keeps
actual current AMTI, ATNOLD and absorption unchanged. The alternative charity
reduction is the smaller of tentative charity carry or the excess gift's
increase in succeeding alternative NOL carry. This branch runs even when no
regular loss remains. No taxpayer-entered income or deduction override is used.

Both prior charitable histories must be supplied independently with the actual
prior source year/reference/completeness. The current method requires both
explicitly empty. Unknown or nonempty records remain saved and block this
method; an empty regular history never establishes an empty AMT history.

## Independently derived controls

These are literal statutory examples, not published IRS numeric examples.

| Case | Actual facts and calculation | Alternative charity carry |
| --- | --- | --- |
| A | 2025 wages100000, gifts60000, regular and AMT opening losses100000 each. Regular claim32000/AGI68000/charity40800. AMT current and modified income59200; claim/absorption53280/carry46720. Removing excess19200 leaves the same modified AMTI and carry. Regular charity carry is separately3840. | 19200 |
| B | 2025 wages100000, capital loss3000, gifts60000, no regular loss, AMT loss100000. AGI97000/charity58200/tentative1800. Actual AMTI38800/claim34920; modified40000/absorption36000/carry64000. Nonexcess gift58200 gives modified41800/absorption37620/carry62380; reduction1620. | 180 |
| C | CaseB with a2005 loss expiring after2025. Actual expired64000 versus comparison expired62380; both succeeding carries are zero. No charity reduction from this expiring loss. | 1800 |
| D | Isolated2026 itemized caseB: actual charity57715/tentative2285; current AMTI39285/claim35357; modified40500/absorption36450/carry63550. Nonexcess gift57715 less500modifiedfloor gives modified42785/absorption38507/carry61493; reduction2057. | 228 |

Full2026 readiness remains closed. Current and comparison loss balances retain
whole-dollar form rounding; original gift cents are preserved unchanged.

## Evidence and remaining scope

- Five canonical failures reproduced before implementation, including absent
  positive-AMT-only carry and lost history fields; all five now pass alongside
  four existing regular-charity cases.
- Two review tests reproduced missing alternative disclosure before correction.
  Saved PDF text verifies both computations, privacy and one notice per page;
  altered receipts/ledger/output/missing or duplicate audits reject.
- Both intake/DOM cases reproduced lost history/missing controls, then passed;
  prior lists start unknown, independent confirmations persist, and source
  changes revoke nested and outer confirmations. A first test harness run used
  the wrong relative fixture path and was corrected before the meaningful red run.
- Working-tree checks:85 consumer tests/20files,7 guided/DOM tests/4files,
  root and web typechecks,4626spec references and scoped lint pass. Immutable
  review/build/browser evidence and commit reference will be appended below.
- Broader prior/mixed-category charitable carry, special alternative sources,
  different regular/AMT bases, and2026standard-deduction170(p) carry remain
  separate internal methods. No unsupported method is described as an external
  approval blocker. Independent human tax/form review remains external.

## Immutable verification and independent review

- Reviewed source tree `af7cced9d46ec9448317aeb29b3f4488e75cce12`, based on
  `8ed1205b66c6e3a9fcfbebeff699e5b5aae049a7`: 812 tests in 89 files passed,
  including the relevant NOL/charity, saved PDF, guided flow and strict spec
  reference suites. Root and web typechecks, 4,613 spec references, scoped lint
  and the production web build passed.
- The production build passed both Chromium viewport cases (1280px and 390px),
  with retries disabled: each history begins unknown, recording one empty
  history leaves the other unknown, actual records survive reload, a source
  edit revokes all dependent confirmations, no source identifiers enter request
  bodies, and the mobile page has no horizontal overflow. Screenshot review
  confirmed the controls remain visible within the viewport.
- A saved one-page review PDF was reopened with pypdf and rendered with
  pdftoppm. Both computations, the unchanged current deduction and the two
  distinct carry balances are readable; the red review-only notice is visible.
  The first rendering invocation lacked the local font configuration; rerunning
  with the existing repository font configuration succeeded. No PDF source
  change was needed.
- The federal agent independently refreshed the controlling sources and passed
  10 package/regular/helper cases. Additional literal probes with opening AMT
  losses of 36,500 and 36,000 independently produced succeeding loss carry of
  500 and zero, and charitable carry of 1,300 and 1,800; the actual 34,920
  deduction and original inputs remained unchanged. No actionable finding was
  reported. This is agent source/software review, not human qualification.
- Evidence: `.local/upgrade-evidence/alternative-charity-af7-exact-tests.log`,
  `alternative-charity-af7-build.log`, `alternative-charity-af7-browser.log`,
  `alternative-charity-review/`, `federal-review-alternative-charity.log`, and
  `federal-review-alternative-charity-probes.log`. The initial exact test attempt
  lacked the isolated archive's Python link; after restoring the link to the
  existing pinned PDF environment, all 812 tests passed.
- A further exact-tree run of the charitable-limit, Schedule A, general federal
  and crypto-charity consumers passed 702 tests in six files
  (`alternative-charity-af7-adjacent.log`).
- Parent independently passed 11 UI/PDF/privacy cases in four files, including
  seven new probes. Altered carry year/category, revoked history confirmation,
  duplicate AMTI audits and changed receipt cents rejected; private source
  references, identifiers and recipient strings were absent from the valid
  statement. Canonical 2026 and export/year gates remained closed. An initial
  reviewer-only future-year assertion encountered the intended earlier gate
  and was corrected; product code was unchanged. Evidence:
  `.local/upgrade-evidence/parent-alternative-charity-review.log`.
- Final rebase onto QSBS source commit `678fe38` preserves its original-input
  review context and mapper changes. Tree
  `2bf00b9eee46a9d82dc0fc3cac071d947288ac82` passed the same 812 tests in 89
  files, root/web typechecks and all 4,624 spec references. Metadata advances
  to 2025.71 / 2026.67 without changing readiness or independent-review gates.
  Final evidence: `alternative-charity-2bf-exact-tests.log`,
  `alternative-charity-2bf-types.log` and `alternative-charity-2bf-spec.log`.
