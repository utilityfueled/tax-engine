# Form 1099-OID source correction — 2026-10-25

Implemented a standalone Decimal recipient-reporting calculator and raw-source
schema. The current continuous-use source is Form 1099-OID Rev. January 2024,
not Form 1099-INT. Treasury Box 8 is additional to Box 1, Box 10 is bond premium,
Box 11 is tax-exempt OID, and Boxes 12–14 identify actual state withholding.
Historical aliases remain explicitly unverified; parsing defaults cannot make
an incomplete record complete, including after reparsing. A positive historical
`taxExemptBondPremium` must be reconciled to actual boxes before verification.

Sources refreshed directly:

- [IRS current combined instructions](https://www.irs.gov/instructions/i1099int)
  and [physical form and recipient instructions](https://www.irs.gov/pub/irs-pdf/f1099oid.pdf).
- [Publication 1212](https://www.irs.gov/publications/p1212): recipient adjustment,
  classification, premium and TIPS examples.
- [Publication 550](https://www.irs.gov/publications/p550): actual section 171
  election and excess premium deduction limits.
- [Treasury regulation 1.171-2 in the official CFR](https://www.govinfo.gov/content/pkg/CFR-2024-title26-vol4/pdf/CFR-2024-title26-vol4.pdf)
  and [T.D. 9653](https://www.irs.gov/irb/2014-06_IRB): accrual-period excess,
  carry, final taxable-bond disposition, and nondeductible municipal excess.
- [Treasury regulation 1.1275-7 in the official CFR](https://www.govinfo.gov/content/pkg/CFR-2024-title26-vol13/pdf/CFR-2024-title26-vol13-sec1-1275-7.pdf):
  same-instrument deflation offset, prior-income ordinary-loss limit and carry.

The source contract is visible in `Form1099OIDFieldsSchema`; the complete synthetic
fixture is `actualOid` in `form-1099-oid-sources.test.ts`. Actual net/gross reporting
prevents duplicate premium offsets. Actual elections distinguish current market
discount from deferred amounts, and taxable premium amortization from a known
choice not to amortize. Municipal coupon interest and its actual specified
private-activity classification remain separate from taxable interest. Box 9 is
already included in Box 2 and is neither added again nor deducted. Box 3 and
withholding remain separate from the interest calculation.

Recipient amounts require actual holding-period/basis/ownership reconciliation;
missing source prices, dates, yields or elections are never derived from payer
names. Signed recipient adjustments require a completed source worksheet reference.
The module preserves cents until the return aggregates/rounds them. Actual premium
periods reconcile to source totals, compute limited Schedule A16 deductions and
carry, and apply the final-disposition rule. Municipal excess produces a
nondeductible loss. Actual TIPS history supports same-obligation deflation and
limited ordinary loss; a different obligation cannot absorb it.

Verification: spec first; new test failed for the missing calculator before
implementation (`.local/upgrade-evidence/oid-red.log`). Then 109 focused tests pass
(new source rules plus historical OID/Schedule B regressions), root typecheck and
scoped lint pass. Evidence: `oid-focused.log`, `oid-types.log`, `oid-lint.log`.
All new OID spec references resolve. The whole spec command currently fails one
unrelated in-progress Schedule K-1 Box14 test rename; no references were waived.

Remaining integration and qualification:

- Federal/Schedule B/AMT/Schedule A/state consumers must use the calculator's
  separate totals once; the federal owner is integrating those separately.
- Guided collection and historical statement re-review must supply the actual
  new source contract. No legacy record becomes verified from this change.
- Explicitly blocked implementation cases still need source-linked integration:
  TIPS interest split across an actual 1099-INT and OID; a combined market-discount
  and deflation allocation; TIPS excess-premium/deflation origin and disposition
  history; and pre-modern taxable premium elections. These are precise unsupported
  cases, not silently estimated zero amounts. The current schema cannot fabricate
  their instrument links, allocations or election history. Issuer-level yield,
  contingent-payment/stripped-instrument and nominee worksheets must be completed
  and reconciled before their recipient amounts enter this reporting module.
- No independent human tax approval, 2026 filing qualification or release gate
  change is represented by local synthetic tests.
