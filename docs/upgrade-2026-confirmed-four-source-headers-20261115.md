# Four retained source headers — November 15

Actual optional integer years now survive parsing for Form1099-C, Form1099-SA,
RRB1099 and ScheduleK1(Form1041). Missing stays unknown. No year is inferred
from a death, discharge, benefit history, current return or form revision.

Confirmed explanations reject known RRB payment-year contradictions, including
zero and withholding-only rows. Ordinary estate/trust fiscal reporting preserves
prior headers; a future header requires a separately reconciled composition.
Known cross-year COD and HSA compositions are held at this same ingress until
their distinct actual-event treatment is supported. Canonical amounts remain
unchanged by this package; matching or missing headers alone do not qualify
an unsettled method. Denials precede provider or accounting effects and retain
the generic private/no-store response.

These are not blanket calendar-equality tax rules. The [1099-C instructions](https://www.irs.gov/instructions/i1099ac)
separate identifiable-event reporting from actual discharge. Inherited HSA
FMV can belong to the death year despite a later [1099-SA distribution](https://www.irs.gov/pub/irs-pdf/f1099sa.pdf).
[Publication559](https://www.irs.gov/publications/p559) gives the ordinary fiscal
ending-year rule and a separate deceased-beneficiary final-return exception.
Root found an overbroad impossibility claim in the first spec; a distinct
spec-only successor explicitly preserves that exception as unsupported source
composition. No deceased-beneficiary method is added. RRB timing follows
[the actual statement explanation](https://rrb.gov/Benefits/IncomeTax/TXL-1099)
and [Publication915](https://www.irs.gov/publications/p915).

The same final test reproduces six failures and one passing preservation
control on the predecessor; all seven pass after implementation. Author
adjacent checks pass 1,116 tests and 61 authenticated in-process POSTs.
Separate review passes 23 tests in four files, including 58 additional POSTs
(47 denied, 11 accepted); four of its six own tests fail on the predecessor.
All observed responses remain private/no-store with zero provider calls and
zero accounting calls on denial. Primary body reads are retained without
invented raw-PDF hashes.

Main passes 167 tests in seven files, all 44 spec references, engine/web types,
scoped lint and unchanged 1,030-row inventory. Its first selection included two
nonexistent test filters; the receipt retains the actual 54 tests in three
files and the corrected adjacent 113 tests in four files. Browser metadata
changes only two source hashes and their binding; all 643 identities and
existing policies remain unchanged.

The audit separately reproduced a preexisting HSA code6 timing defect: death-year
FMV is currently included again with later distribution earnings. That is an
independent monetary correction, still required before current combined/runtime
qualification. This header package neither repairs nor qualifies that amount.

| Evidence | SHA-256 |
| --- | --- |
| Original four-file candidate | `5c7be28aead1b51e0b9f05a4dd804e810f2dd7a15338a606269a6b776f1dc52b` |
| Final caveat successor | `48bd353008b17995d124f91f53713ec90d96ba0b84c7fafd69bb287e28136a67` |
| Separate review | `51fdfa6d6e3cc1a323a493868c5fb7daf5bd71ddecafe5347d7dd036a4a5fe21` |
| Main checks | `934cb98d3dfc3e84455c015ea4a868bf37e9f7149ff83fc01fc0c7a782968af8` |

Ignored evidence folders are `nov15-confirmed-four-source-year-triage`,
`nov15-confirmed-four-source-year-trust-caveat-successor`,
`nov15-four-source-header-image-security-review` and
`nov15-four-headers-root-review`. Human approval, final2026 forms, current
combined checks and distribution qualification remain separate gates.
