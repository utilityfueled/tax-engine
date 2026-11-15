# November 15 combined-source verification

Application commit `8cc5b0ec` is pushed to `main` and
`codex/2026-upgrade-backup-20261114`. Automatic production builds are disabled;
the automatically requested production build was canceled. No production release,
filing or model promotion is qualified by this evidence.

All twelve local checks pass on this application source. Unit and coverage each
pass 28,848 tests in 2,114 files. Coverage is 92.02% statements, 88.16% branches,
91.04% functions and 95.29% lines, preserving the 90/85/90/90 floors. The browser
run passes 648 cases with five original skips across all 653 cases: two workers,
zero retries, the existing 30-second default and eight existing overrides. Both
owned PostgreSQL instances and the browser server close normally. Root and
independent artifact reviews verify the Git archive, six literal links, fifteen
retained public samples, 5,218 complete browser-source inputs and the separate
1,993-file finite audit. The initial staging acknowledgement was unavailable;
a separate direct reconciliation is retained instead of inventing that receipt.

[GitHub CI](https://github.com/utilityfueled/tax-engine/actions/runs/43752080339)
passes all six jobs; its logs independently confirm the same test counts and
coverage. [Docker](https://github.com/utilityfueled/tax-engine/actions/runs/43752080347)
passes. The [ordinary self-host job](https://github.com/utilityfueled/tax-engine/actions/runs/43752080280)
passes 648 cases/five original skips under its existing 90-second default.
The strict container gate fails: 634 passes, fourteen failures and five original
skips. Twelve failures include the overall 30-second deadline; two RRTA cases
exceed the separate four-second PDF-inspector deadline. Artifact review verifies
the source, image, SBOM, archive import, six Compose phases and normal cleanup;
this does not turn the failed gate into a pass. The configured scan retains
192 unaccepted findings: 56 High, 61 Medium, 17 Low, 47 Negligible and 11 Unknown.
Its actual default suppression configuration is retained; no unfiltered scan or
risk acceptance is claimed.

A separate [optional Linux attempt-2 run](https://github.com/utilityfueled/tax-engine/actions/runs/43753753112)
retains the first PGDG key-download failure before image/browser/profile execution.
Only that failed job was rerun once after the workflow was terminal. Its strict
run records 640 passes, eight explicit 30-second deadline failures and five
original skips across all 653 cases, with the original two workers, zero retries,
eight overrides and eight natural windows. This does not replace the preceding
required strict gate's fourteen failures. Source/image/SBOM/archive and all six
Compose phases reconcile; configured findings remain unaccepted.

The separate fourteen nonqualifying diagnostic reruns all fail. Ten sanitized
profiles pass numeric/privacy validation; four are unavailable. Captured sampling
intervals total 90.734385 seconds across partial main-isolate lifetimes, not
process CPU time or full-test coverage. Exact local public bytes match 44 of 63
metadata entries, representing 17 of 31 distinct chunk hashes; original asset
paths/source maps are unavailable. Hash-work samples and caller observations do
not establish deadline cause or a Linux performance fix. Root artifact review
`5e43a65f…` and independent `81c6787a…` preserve both sets of failures.

Fourteen of fifteen downloaded remote sample hashes match the retained samples.
The changed rolling [Publication 4491](https://www.irs.gov/pub/irs-pdf/p4491.pdf)
now has a 2026 RETURNS cover and October 2026 revision: 22,529,367 bytes,
SHA-256 `85d627de33310ee10e5cc0fc1ea855cfcaf6559c4f085b77854db45c3c5c49fa`.
The official [accessible 2025 guide](https://www.irs.gov/pub/irs-access/p4491_accessible.pdf)
still exactly matches the retained 27,347,185-byte 2025 sample, SHA-256
`13b6ef6372f32e70d0fbb1e0d71078bc056b119c9da07ddf75d20f101e04891a`.
The January 2026 revision of [Publication 4491-X](https://www.irs.gov/pub/irs-pdf/p4491x.pdf)
is for 2025 returns. Revision year must not be substituted for return year.
The source/year correction is a separate package; these training guides do not
qualify final annual filing forms or provide taxpayer facts.

The protected isolated Preview passes 118 API cases, fourteen saved-workspace UI
journeys at desktop/mobile widths and five saved-PDF checks. Root and independent
completed readers verify the artifacts. A separate visual inspection covers all
fourteen saved screenshots, with no blocking defect observed in the shown states;
it is not a complete accessibility review or proof every field was visibly typed.
The run uses 2,075 of 2,310 allowed operations. Both synthetic sessions are signed
out, both trial subscriptions canceled and both customers deleted. Temporary
deployment/environment/cache and Stripe webhook settings are restored. Two
synthetic account rows remain for final parent-branch cleanup. The first signup
attempt's missing consent field and failed receipt are preserved; a separate
read-only absence check precedes the corrected helper. Application consent
enforcement remains unchanged. No model calls occur in this Preview suite.

The ARM64 rehearsal passes 24 stages, four workloads, six Compose phases and all
653 collected browser cases (648 passes/five original skips). Root and independent
completed readers verify the runtime image, SBOM, archive/recovery, source closure,
normal VM stop, original resources and socket/default-route restoration. Earlier
reader failures caused by sandbox-denied read-only process inspection are retained;
the unchanged readers pass with the required visibility and no workload replay.
The configured ARM scan retains 191 unaccepted findings: 56 High, 61 Medium,
17 Low, 47 Negligible and 10 Unknown, with zero ignored matches. Its default
suppression settings remain explicit. This is execution evidence, not release
or security acceptance.

Preceding ARM maintenance removes exactly 27 duplicate public rehearsal archives,
retaining local originals, all 37 image records and all 32 guest-root names. Nine
proven candidate files are tightened from 0644 to 0600 before the unchanged strict
removals. All 44 commands exit zero; the intentional boot daemon group is
separately reconciled and later stopped normally. Available guest disk increases
from 263,807,795,200 to 270,245,945,344 bytes, above the unchanged 250-GiB floor.
No image, store or unrelated file is pruned.

The separate cloud purchased-credit rehearsal successfully creates its isolated
schema while restoring the original role membership and database privileges.
It then stops during sandbox card Checkout: 74 SQL operations, six Stripe
operations, 158 browser requests and **zero provider calls**. Owned child processes
and pools close normally. The original unknown-payment receipt is retained;
schema and owned sandbox resources initially remain. A separately reviewed
two-GET Stripe observation first confirms the owned Checkout is open and unpaid,
with no payment intent; that observation alone does not prove database issuance
or authorize cleanup. The original HOLD/unknown receipt `e2af6e79…` is unchanged.

A later, separately authorized read-only reconciliation uses 40 SQL queries and
two Stripe GETs to verify the exact unused issuance, expired unpaid Checkout and
absence of a payment intent. A subsequent owned-resource cleanup uses 109 SQL
queries and ten Stripe requests. It verifies committed absence of the isolated
schema, inactivates the owned price/product and deletes the owned customer.
Both phases close their connections and owned processes normally, with zero
payment actions and zero provider calls. Root read-only/cleanup reviews
`32375181…`/`4453cd3f…` and independent `cc51fb57…` bind those later observations.
The original foreign snapshot was lost and is not reconstructed: later fresh
schema/table names and row counts, role memberships and database ACL parity do
not establish historical foreign-content integrity. The original financial
unknown evidence remains; no successful paid-credit settlement, model run or
public Checkout qualification is inferred from reconciliation or cleanup.
Known provider exposure remains $0.29423670, including the existing $0.022384
unreconciled reserve. Public credit purchasing remains unavailable.

Root local evidence digests: all-twelve review `cb017e06…`; independent
`d3712299…`; completed Preview `e99f053d…`/`253986b6…`; completed ARM
`d835d7d9…`/`9e649f1d…`; strict remote artifact `8080ca5d…`.
These identify private retained reports, not publicly downloadable artifacts.

Qualified human tax/spec/expected-output review, independent human AI labels,
final annual 2026 forms, accountable advisory owners/expiry and independent
security/privacy review remain required. The strict Linux failures and successful
paid-credit qualification remain open; later scoped cleanup is complete without
recovering the historical foreign baseline. Current `79792ec7` combined checks
are separate and pending. No readiness threshold is weakened.
