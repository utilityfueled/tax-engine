# Require original facts before canceled-debt exclusions

The public full-return calculator previously accepted a legacy bankruptcy flag
with a 50,000-dollar canceled debt and no chapter, court history or original
attribute records. It reported zero canceled-debt income, AGI and tax. The same
unsafe result reached the actual tax-explanation HTTP handler and its verified
engine audit context. This was an admission defect, not evidence that the
fictional taxpayer qualified for bankruptcy relief.

Independent probes found the same fallback through principal-residence, farm
and real-property-business exclusion amounts and a basis-first election.
Negative special amounts were also accepted and could turn 50,000 dollars of
debt into 50,001 dollars of taxable income. The full-return admission now requires
the actual source method for affirmative exclusion/election claims, positive
insolvency gaps and any nonzero special exclusion amount. Existing complete-source
validators decide eligibility and attribute ownership; a bare amount cannot
bypass them. False flags and actual zero amounts preserve the ordinary taxable
control of 50,000 dollars and 3,875 dollars of tax.

The spec preceded the actual failing public, HTTP and audit tests. The initial
bankruptcy failures and subsequent broader positive/negative failures remain
retained. Complete original Chapter 12/13 successor fixtures preserve the
previous zero-COD and carryover assertions. The incomplete principal-residence
return now explicitly rejects; its basis-only arithmetic is retained and
strengthened in a lower-level supplied-eligibility test. That test does not
establish a qualified residence return. No test threshold or readiness gate was
lowered.

Authority remains the conditional exclusions and attribute rules in
[IRC §108](https://uscode.house.gov/us/usc/119-118/t26/s108/),
[Publication 4681](https://www.irs.gov/publications/p4681),
[Publication 908](https://www.irs.gov/publications/p908) and
[Form 982 instructions](https://www.irs.gov/instructions/i982).
This package implements source admission, not the still-required secured
residence, farm, real-property-business or separate-estate source methods.

Verification passed 613 tests across 11 affected files, the final 462 tests in
three files, typecheck, all six new spec references and scoped lint with zero
errors. A separate reviewer verified all six frozen files, independently
reproduced the old public defect, and confirmed rejection of seven unsupported
positive/negative claims. Two complete bankruptcy conservation controls, 42
packet/identity/history mutations and six actual HTTP/public tests passed.
The ordinary controls and lower-level arithmetic remain available.

Private evidence:

- `nov14-legacy-cod-admission-audit/FINAL-REVIEW-V2.json`, SHA-256
  `c4b4a95c859b376bf9e9d585150e61a12d679f07eb76ec3370971465f8e1d827`.
- `nov14-legacy-cod-source-independent/source-review-v2.json`, SHA-256
  `81508048415eea6fd52ca3ee44eb43921c50d735d4b09b700f192db15450d6c5`.

The earlier frozen `61ca18f7` full-check lanes do not cover this later guard.
Combined current-source verification and runtime artifacts must be refreshed.
Professional tax review, final forms, filing and model promotion remain separate
requirements. This package is committed locally under the active push hold.
