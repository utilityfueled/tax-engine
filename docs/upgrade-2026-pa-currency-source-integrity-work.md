# Pennsylvania currency source integrity

November 5 UTC, 2026. The ordinary-return monetary wrapper now validates the raw
currency syntax before removing intended decoration. Malformed `1,0` or `1,,0`
previously became `10` and could pass source confirmation. Those literals now
remain visible and invalid. This package depends on the separate shared-control
fix in `9a93611c`, which preserves bare dollar/comma tokens through blur.

The wrapper emits an update only when the normalized string differs exactly
from the stored string. An unchanged `6475` displayed with grouping keeps the
same confirmed packet. `6475.00`, `6476` and changed provenance still revoke
confirmation. Deliberate clearing preserves unknown; explicit zero remains zero.
Canonical source validation, calculations, Decimal arithmetic and rounding are
unchanged. There is no comparison based only on equivalent cash amounts.

The existing spec is updated first, followed by actual ReactDOM tests. Against
the corrected shared control and old PA wrapper, 44 cases produce 12 genuine
failures and 32 passes. The local wrapper is then changed. Seven focused files
pass 117 tests, including 17 new DOM cases and all 25 existing monetary seams.
The original entry test now starts with a confirmed `6474` before entering
`6475`, retaining its original real-edit invalidation and canonical-validation
assertions. Existing seam and unknown/zero test bodies are unchanged.

PA spec validation passes 1,089 references; scoped lint, diff and product type
checks pass. An additional combined test/component typecheck retains 18 fixture
diagnostics. A compiler-host comparison establishes identical diagnostics at the
unchanged baseline; this is recorded as parity, not a passing combined check.
No diagnostic suppression or fixture weakening is introduced.

Independent engineering review passes with no actionable findings, including 17
additional controls using the actual callback and shared helpers. Author test
receipts are inspected, without claiming an independent DOM/browser rerun or
qualified human tax review. ROOT reviews the source/spec/test diff, reads both
reports and verifies all 21 author and four reviewer evidence members.

- Author manifest: `5707d0b09387cfe94847b0904d156ba59fb785165e295d1093171afffcebc642`.
- Independent manifest: `0af0e555dbdef7fd70a735355ef2e322927031714f4ff612408acbd224755ea0`.
- Component: `50f8b8679fff3aa9c799500711157d06c4b2065cab70fa96c6462fac0f4d7b4b`.
- Test: `4e1ed4204b5cdef4c4a634b98236ede597078fc6a1e0ec85c1dc9feaed3a5901`.
- Spec: `cb10ca14af2a3afd39be2d132ce71dc8ae500eeb8bad334ebfd1356393a09483`.

Evidence is under `.local/upgrade-evidence/nov05-pa-currency-repair-*`.
On the combined source ROOT also passes all three required type checks, all
8,222 spec references, inventory and both builds. Full lint, unit, coverage and
actual browser validation continue separately. Earlier Ohio-only full-unit and
coverage passes do not cover this successor. No performance or CI-deadline claim,
filing activation or final hosted/self-hosted qualification follows.
