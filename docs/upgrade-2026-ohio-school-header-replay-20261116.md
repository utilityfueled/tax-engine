# Ohio school and header validation replay

The guided Ohio school/header composition now reuses the school method from an
actual completed adapter during the same synchronous invocation. The full school
adapter still runs first. The header still calculates fresh federal results and
retains its original validation order, comparisons and fallback. Standalone
header calls perform the original full validation.

The proof is opaque, immutable, held in a WeakMap and revoked in `finally`.
Consumption requires equality of the complete current input and fresh federal
material. Defined unsupported values, accessors, extended Decimal metadata,
nonfinite values and unsupported arrays cannot authorize reuse. Admission does
not invoke property getters. Missing, forged, changed or expired proofs fall back
to the original adapter. Durable commitments, tax formulas, monetary rounding,
confirmation requirements and readiness gates are unchanged.

## Verification

The spec and regression were added before implementation. The main-checkout
regression first failed with the original nine federal and three school calls;
the reviewed implementation passes with seven and two. Existing output, state,
source-error and isolation assertions remain. Root verification passed 147 tests
in six files, engine and web types, scoped lint, spec validation and regenerated
inventory checks. Initial inventory staleness and three malformed spec test
references are retained; the references were corrected and those checks passed.

The first full unit run at `66fb52dc` then caught the catalog's stricter quoted
line/literal-test-name contract: 28,903 tests passed and one catalog assertion
failed. Its database closed normally. The correction quotes the same YAML line
identifiers, links exact literal names and declares the same two fixture cases
with `test.each`. Every fixture and assertion remains. The complete catalog plus
the affected render tests now pass 968 tests; spec validation, inventory and lint
also pass. The original full failure remains retained. Fresh full checks are
required for the corrected revision.

Independent candidate verification passed 178 tests in ten files, including eight
separately authored accessor/effect controls. Thirty complete output/error
records remain equal. The final predeclared ABBA comparison, using 80 measurements
per implementation, reduced the local median from 41.632979 ms to 33.4563335 ms
(19.639828%, above the unchanged 10% threshold). This timing does not establish
remote-container performance or explain the retained strict-CI failures.

The earlier duplicate-federal experiment (5.87%) and strict descriptor variant
(8.47%) failed that threshold and were not adopted. Earlier serialization defects
and their corrections remain in the evidence; the final candidate validates
descriptors while avoiding redundant allocation.

Browser metadata changes only refresh four runtime source hashes, adding the
new helper to the closure (1,996 to 1,997 files), and the diagnostic audit digest.
All request policies, case identities, skips, retries and deadlines are unchanged.
The inventory adds two unsupported entries and grants no qualification.

## Evidence and remaining work

Local ignored evidence:

- Final candidate: `nov16-oh-school-header-descriptor-allocation-successor`,
  manifest `3e08c38e991659578fe82d5dab450657f5a14cb09638c6a3ab32cb052a8693de`.
- Independent review: `nov16-oh-school-allocation-independent-review/REVIEW.json`,
  SHA256 `dd112a389c62383cfa1c89ac1973929c3348a1d6f6a930628b4fe98fbdfb492b`.
- Main adoption, original RED, corrected checks and metadata census:
  `nov15-oh-school-header-root-adoption`.

All twelve integrated checks will run against the resulting exact commit in
separate static, unit, coverage and browser directories. Existing ARM64 and
protected Preview runs use the earlier `5a45443e` application source and do not
qualify this change. Human tax review, final annual forms, security acceptance,
AI qualification and broader release criteria remain open.
