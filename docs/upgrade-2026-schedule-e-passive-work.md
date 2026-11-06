# Passive distribution gain in Schedule E review output

The engine already keeps the actual excess distribution gain on8949/D while
using its passive character on8582 to release an ordinary loss. The existing
Schedule E renderer printed combined8582 income in ordinary column(h), so a
1000 capital gain and1000 released loss incorrectly appeared as both income
and loss, followed by an unexplained reconciliation difference. Five spec-linked
PDF regressions reproduced this mapping and source-context failure before the
correction (`schedule-e-passive-red.log`).

The physical mapper now uses the validated original K1/passive-index handoff
from `2669c37`, subtracting only its independently derived capital transfer.
Schedule E retains the actual rounded ordinary component and its allowed loss.
The capital amount stays on8949/D; no new deduction, gain or allocation is
computed by the renderer. Cents around the combined8582 rounding boundary and
an earlier nonpassive K1 have literal printed-field assertions.

The private Schedule E context now covers both royalty property sources and
actual single-passive-business distribution sources. It binds original or
render-redacted input and retained calculations before template/output I/O;
only fresh copies of monetary/index values cross the rendering boundary.
Forged tokens, changed valuation/owner/history and changed passive/capital
results reject. Original names and IDs never need to be reconstructed from
redacted records. The complete packet and actual workspace export prepare this
context before redaction. A private negative control that removed the workspace
hook failed the original-recipient guard, then the product file was restored.

Official [2025 Schedule E instructions, line28](https://www.irs.gov/instructions/i1040se)
and [2025 Form8582 instructions, reporting allowed losses](https://www.irs.gov/instructions/i8582)
were refreshed October26. The latter keeps passive income/loss and8949 gains on
their appropriate forms; passive classification alone does not turn capital
income into ordinary Schedule E income. The supporting actual-distribution
source method and its scope remain in the existing core ledger.

Development checks pass16 cases/3PDF files and28 cases/2files including the
unmocked guided workspace export. Logs live under `.local/upgrade-evidence` as
`schedule-e-passive-green.log`, `schedule-e-passive-workspace.log`, and the
retained `schedule-e-passive-workspace-negative.log`. Exact frozen checks,
saved artifact inspection and separate agent review are recorded before delivery.
Every PDF remains review-only; no2026 form, filing, human review or release
qualification is supplied by this mapping correction.


Separate review of tree5772f719 found a retained-result bypass: deleting only
its original distribution attachment skipped the input-only predicate and
printed the capital amount as ordinary income again. The independent report,
original failing probe and saved wrong fields remain in
`.local/upgrade-evidence/ai-passive-pdf-review.json` and its linked evidence.
The new removed-source spec and owned regression fail before the repair
(`schedule-e-passive-removal-red.log`). Both direct and complete-packet paths
now require source validation whenever the retained audit contains the actual
passive distribution calculation, even if no source or prepared token remains.
Deleting a single attachment or its entire packet therefore rejects before
output I/O. The original immutable review snapshot remains unchanged.


Final reviewed tree `e0f34859c65a66e21a5d786d8807c403116316ec`, based on
`9173d20`, passes 510 cases in 7 files, root/web typechecks, all 5,306 spec
references and scoped lint (zero errors, 40 warnings). All eight frozen hashes
remain unchanged in its exact verification. The final manifest and command/log
hashes are `schedule-e-passive-v2-review-snapshot.json` and
`schedule-e-passive-v2-exact-checks.json` under `.local/upgrade-evidence`.

Separate rereview passes 33 cases in 3 files, including all four original private
probes byte-for-byte unchanged. Source removal, deeply mutated monetary copies
and an S-corporation basis-suspended current loss are covered. The corrected
report is `.local/upgrade-evidence/ai-passive-pdf-corrected-review.json`; the
original failing report is retained. No actionable finding remains within this
mapping/context scope. This is agent software/source review, not human tax review.

The final frozen source generated 19 saved PDFs with 35 pages, including the
complete redacted packet, direct base Schedule E, both 50.40/50.60 rounding
cases and the separate S-corporation control. An independent reader reopened
all files, checked 30 literal physical values, private-identifier absence and
one review notice per page. All 35 rendered pages were visually inspected;
ordinary 50/51 and losses 400 remain in Schedule E, while capital 1000 remains
on8949/D. Exact PDF hashes and checks are in
`.local/upgrade-evidence/schedule-e-passive-v2-artifacts/reopened.json`.
The initial generator CLI could not open its sandbox IPC socket; the same script
succeeded with the Node loader, without a product change or live service.

Delivery preserves all seven reviewed non-ledger blobs. It changes no engine
calculation, rule version, form qualification, privacy gate or readiness gate.

Final integration on `95e4276` passes 30 tests in 3 files, including the
actual Pennsylvania and passive-source workspace packet paths. The log is
`.local/upgrade-evidence/schedule-e-passive-integrated-unit.log`. All seven
non-ledger blobs match the final immutable reviewed tree exactly.
