# Original-bound 2025 railroad payroll review PDFs

The review export can now render a finite 2025 single/MFJ railroad-payroll
cohort from actual original payroll records and explicit documentary facts.
This API-only path produces redacted review documents. Filing, draft/current
2026 forms and unsupported adjustments remain unavailable.

The new opaque context binds the original W-2s, complete current federal result,
source year/reference and an explicitly confirmed absence of ordinary uncollected
Medicare codes B/N. It replays private originals before packet or template I/O.
A missing fact stays unknown. Unknown or positive unmodeled B/N adjustments,
forged/stale contexts, equal-tax identity substitutions and private display
markers deny. Four existing missing-context railroad export denials remain.

[The 2025 IRS Form 8959 instructions](https://www.irs.gov/instructions/i8959)
keep ordinary wages and RRTA compensation separate. The renderer preserves
lines 14–17, ordinary excess withholding on line 22, railroad withholding on
line 23 and their combined line 24. Inapplicable self-employment lines stay
blank; applicable known zeros print. Form 4137 reconciles original payroll while
rendering a separate scrubbed display copy, with employer identifiers absent.
Ordinary non-railroad mapping is unchanged.

Independent engineering expectations include MFJ ordinary wages 260,000 and
RRTA compensation 300,000 with 1,000 unreported tips: ordinary additional
tax 99, railroad additional tax 450, combined tax 549; separate excess withholding
90 plus 450 equals 540. A zero-tax railroad case retains 145 withholding. Decimal
oracles and official blank fields are retained; no professional tax approval is
inferred from these engineering checks.

Spec-first failures precede the 92 author passes and 96 distinct ROOT passes.
ROOT reads the complete seven-path patch and replays forgery, source-identity,
privacy-marker and immutable-fact negatives. Twenty-nine actual PDFs, 47 pages
and 4,675 logical indexed/decompressed objects match the author's final outputs,
excluding only creation/modification dates. Five rendered pages were inspected
for actual field placement, blanks, identifiers and review footer.

Current main passes 92 focused tests/seven files, plus 1,106 spec/script checks
in 14 files, without changing the five-second unit deadline. TypeScript, contract/web types, spec/inventory checks, both builds and lint pass.
Lint retains the existing 11,863 warnings with zero errors. Inventory adds exactly one unsupported entry:
910 entries, 68 supported. The browser source audit changes exactly five source
hashes (two additions and three replacements), 1,803 to 1,805 source files;
all 150 contracts/584 cases, five old skips, request limits, retries and timeouts
remain exact. Ten missing/stale-hash negatives reject. Full successor suite,
actual UI/distribution/hosted, human review and final-2026 qualification remain
required.

Private evidence under `.local/upgrade-evidence`:

- `nov05-rrta-payroll-review-paper-private`: 215-member manifest
  `faa03f6349077c6ec2906449d858fda7d2a1e07795be3ad56c2f50e03ec439b2`.
- `nov05-rrta-paper-full-object-parity`: six-member manifest
  `796f7b73ce1067899951182d8b0f30386665bda8640015480d76dd8d9d649c0c`.
- `nov05-rrta-payroll-review-paper-root-independent`: 44-member manifest
  `52616daa0131fab4eab37c732eea7047a2ecab4d22de3c8bf9d0789996305116`.
- `nov05-rrta-payroll-review-paper-main`: main checks, exact audit delta and
  retained original unsupported guards. No production or provider action.
