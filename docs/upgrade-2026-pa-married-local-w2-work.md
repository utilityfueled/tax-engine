# Married PA local W2 source boundary

The married ordinary-return composer now preserves complete, current original W2
local rows independently of Pennsylvania state withholding. Each row retains its
actual owner, original index, printed position, exact Decimal amounts and explicit
separate-return jurisdiction. Matching permits only case and whitespace
normalization; no locality alias, obligation, rate or settled payment is inferred.
Positive legacy local scalars without complete original rows remain rejected.

The official [W2 instructions](https://www.irs.gov/instructions/iw2w3), boxes15–20,
separate state and local reporting. The [2025 PA40 instructions](https://www.pa.gov/content/dam/copapwp-pagov/en/revenue/documents/formsandpublications/formsforindividuals/pit/documents/2025/2025_pa-40in.pdf),
Line13, credit actual Pennsylvania withholding. The jurisdiction-name admission
boundary is a conservative implementation limit, not a general tax-law rule.

Spec-first source tests initially produce4FAIL/12PASS; supplemental legacy-wage
and paper-boundary failures are retained. Final338 tests across12 files pass,
along with product types, scoped lint, five spec references and diff checks.
An initial expected Decimal display string was corrected from300.50 to300.5;
raw source identity remains bound. Twelve old fixture typing diagnostics match
the baseline; that additional fixture check is not a clean pass. The retained
final test log records results; it does not contain a separate invocation receipt.

Distinct engineering review verifies all five source pins and passes14 additional
actual-source controls. Fractional J/M local amounts remain separate while state
withholding stays2456 jointly or1535/921 separately and federal AGI stays80000.
Unknown obligations, aliases, wrong owners, invalid money and positive blank
localities reject. Audit output omits private locality/provenance literals.

Private evidence: `.local/upgrade-evidence/nov05-pa-married-local-w2-boundary/`,
manifest SHA256`f616fb8b9898e546c5b583ef160a20a9631d29f941d5df1dd91908868141eb66`;
distinct review `nov05-pa-married-local-w2-independent/`, manifest
`1cdfb0c3290f3bdec4c64d21825d76db98eb30cc960a99b1e97f5cfb68097eb3`.
Root reads the source/spec/tests/review and verifies all44 manifest members and
all five current source pins before committing.

Positive-local paper output remains explicitly denied pending its physical
successor. Child/care paper and incomplete2026 federal gates remain closed.
No local return, filing, human tax review, final2026 form, browser or release
qualification follows from this package. Global checks continue separately.
