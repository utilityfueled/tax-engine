# Ordinary NIIT source completion

Status: core committed as `a6c5f3da3b833622f12bc7bf1a201655a2e396c4`;
guided intake implementation and isolated verification are complete.
No tax-year, filing, physical-form qualification, model or deployment gate changes.

## Sources and decisions

Refreshed 2026-10-25:

- [Final 2025 Form 8960 instructions](https://www.irs.gov/instructions/i8960),
  lines 3 and 9a–10: include actual taxable nonqualified annuity income and
  allowable investment-related deductions. Qualified retirement plan income is
  excluded; generic Form 1099-R code 7 does not establish that classification.
- [Form 1099-R instructions](https://www.irs.gov/instructions/i1099r), code D:
  identify nonqualified annuity or insurance distributions that may enter NIIT.
- [Publication 575](https://www.irs.gov/publications/p575): nonqualified annuities
  cannot use the Simplified Method. Unknown taxable amounts require actual
  General Rule information; this package does not invent a taxable amount.
- [Regulation 1.1411-4](https://www.ecfr.gov/current/title-26/section-1.1411-4)
  and [IRC 1411](https://uscode.house.gov/us/usc/119-118/t26/s1411/): actual
  allowable taxes allocable to investment income, with no duplicate deductions.

The new pure source resolver binds explicit annuity classifications to the actual
payer name/TIN, account reference, owner, gross distribution and taxable amount.
A row index alone cannot distinguish equal-value accounts from the same payer.
Both 2025 and 2026 reject an unresolved taxable non-IRA classification when NIIT
can apply. Below-threshold unresolved historical facts remain unverified.
An actual supported code D distribution needs its owner and taxable source;
it does not require a redundant plan classification record.

The tax worksheet retains actual state/local income, real property and personal
property tax amounts, the documented allocation method, actual regular deductions
after SALT, and the investment allocations. It reconciles to Schedule A lines
5a–5e. Sales taxes cannot reduce NIIT. Source cents are summed before rounding the
physical deduction line. Interest, taxes and ordinary loss share the final
itemized allowance once; a binding limit across multiple components requires
actual completed allocation amounts.

The canonical return remains the only ordinary-income calculation. NIIT includes
the same taxable annuity once on line 3. Render-only review copies redact actual
account references without mutating complete calculation or backup source records.

## Verification

Spec-first tests reproduced omissions and unsafe assumptions before correction:

- Canonical annuity NIIT was zero despite actual taxable annuity income.
- A 2025 generic taxable non-IRA source above threshold lacked classification.
- Replacement payer and replacement account identity reused stale classification.
- A nonqualified source accepted Simplified Method inputs.
- A zero gross distribution with positive reported taxable amount bypassed the
  unresolved classification branch.
- Review copies retained the newly preserved actual account reference.
- Retirement/investment/rental routes could not reach the NIIT source section.

The independent numerical fixture uses wages 250,000, taxable interest 20,000,
and annuity gross 30,000 with taxable amount 10,000. Actual investment tax
allocations 2,000.25 + 500.25 round once to 2,501. Thus AGI is 280,000, NII is
27,499 and NIIT is 1,045 (27,499 × 0.038 = 1,044.962). Both supported calculation
years exercise this oracle without enabling the 2026 production gate.

The core commit was checked from immutable tree
`f445a8dd8193f1336a467e51509a70689ba2bb24`: 2,879 tests in 90 files passed,
root types passed, all 4,038 spec references resolved, and scoped lint had zero
errors with four existing federal non-null assertion warnings. The staged code
excluded concurrent Marketplace and private-activity-bond work.

Local evidence is under `.local/upgrade-evidence/`:

- `niit-account-consumers.log`: 2,885 tests in 92 files passed after the final
  account-reference, amount-bound and render-copy additions.
- `niit-account-binding-red.log`: replacement account regression failed first.
- `niit-final-source-privacy-red.log`: privacy and impossible amount regressions
  failed first; `niit-final-source-privacy-green.log`: 15 tests passed.
- `niit-ordinary-pdf-green.log`: four physical PDF checks passed. The new check
  reopens all 11 populated monetary fields through pdf-lib and pypdf, compares
  canonical and widget values, requires appearance streams and exactly one
  visible review notice. `niit-ordinary-review/form-8960.pdf` and PNG were
  generated and visually inspected; values align with the printed 2025 lines.
- Parent's independent software/source review, including the account-binding
  correction: 14 tests across five files passed in
  `parent-niit-account-review.log`. This is agent review, not human tax approval.
- Root and web types passed; all spec references resolved. Scoped lint had no
  errors; warnings were confined to existing assertions outside changed lines.

The broader retirement tests now provide actual owners for their synthetic code D
records. A prior invalid nonqualified Simplified Method fixture now states its
actual reported taxable amount, preserving its original numerical oracle.
Two unrelated owner-separated Form 5329 fixtures use explicit lower synthetic
wages so they remain below NIIT thresholds; all their tax assertions are retained.

The guided implementation was checked separately from immutable tree
`1181285e3c24212418af4cd1d9edeba0cd00a47c`: 687 tests in 53 files passed,
root and web types passed, all 4,044 spec references resolved, and scoped lint
had zero errors. Its 15 warnings occur on unchanged existing lines. Evidence:
`niit-ui-staged-tests.log`, `niit-ui-staged-types.log`,
`niit-ui-staged-web-types.log`, `niit-ui-staged-spec.log`, and
`niit-ui-staged-lint.log`. This evidence paragraph was added after those checks;
no implementation changed. Concurrent PAB, Marketplace and saved-bundle edits
were excluded from this isolated tree.

## Intake and remaining boundaries

The intake collects actual statement classifications and tax worksheets locally,
preserves unknown facts and exact decimal strings, forwards the same validated
facts used by section completion, and clears confirmation after substantive
source changes. Confirmation-only edits do not create confirmation loops.
Retirement, investment and rental routes reach this section before payments.

Separate methods remain explicit: unknown General Rule taxable amounts, foreign
tax deduction/credit election coordination, and recovery-year tax adjustments.
These need their actual method/source contracts; they are not waived by a user
confirmation or presented as external approval blockers. Final 2026 form and
human tax qualification remain external evidence requirements.
