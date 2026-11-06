# November 5 current CI image and recovery evidence

[Web run 42037462052](https://github.com/utilityfueled/tax-engine/actions/runs/42037462052)
fails in both browser jobs before cases at the source-audit prerequisite. Its
successful image smoke, recovery, SBOM and scan steps remain useful bounded
evidence. They do not establish a successful workflow or qualified image.

The downloaded artifact `13420595161` matches GitHub's ZIP digest
`51f25d148412ef931107f460cfecbcdf5558321b55c22349736f416d59e1e007`.
All 14 extracted members are retained locally. The actual fetched CI merge
`96608e6baa71c251b7e2b84b33dbfe9bef69d941` has upgrade head `7d93fd67` as its
second parent and exactly the same complete Git tree:
`b11af6276f520a967cffe5845ff1eb2fc514c866`. Saved source/tree, Dockerfile,
lockfile, workflow and actual archive hashes match. The image retains its real
merge revision label.

The immutable linux/amd64 candidate is
`sha256:076e5a250f84e05a25aeb53d1509657ff8bb1b14ee2c1cfb4a98e4660c18d639`.
Candidate, browser container, Syft and Grype bind the same image. Embedded
configuration bytes reconstruct its ID and exact filesystem layer list.
Hardened smoke passes as uid 1001, read-only, with health/assets and 52 templates,
without provider keys. Six isolated synthetic Compose phases preserve database,
browser-fact and original-document hashes: previous, upgrade, database restart,
dump/restore, rollback and re-upgrade. Nine-table/two-tenant exact-cost restoration
and encrypted browser recovery/deletion pass. The recorded request-marker check
remains limited to its stated raw synthetic markers.

Syft 1.42.3 catalogues 279 packages. Grype 0.121.0, with its database built
November 5 at 06:21:06 UTC, reports 181 matches across the same 80 registered
advisory IDs: 61 High, 65 Medium, 11 Low, 44 Negligible, zero Critical.
There are 136 `wont-fix` and 45 `not-fixed` matches. **All 80 dispositions remain
OPEN_UNACCEPTED**, with security/platform confirmation pending and the existing
November 7 or before-qualification expiry. No applicable patch, risk acceptance
or reachability conclusion is inferred. The [primary-source register](upgrade-2026-image-advisories-20261104.json)
and [midday source refresh](upgrade-2026-advisory-midday-refresh-work.md) retain
their original scope and unresolved Next/Node obligations.

Root verification passes 30 reconstruction checks. Distinct saved-evidence review
passes 41 checks across this artifact and the [current full unit/coverage receipts](upgrade-2026-7d93-global-verification-work.md).
All original members remain unchanged. Local evidence manifests are
`2827a7fdc3d442a088f3ca78ac4e97b335aec69fe2496d0f0b925b0eb115c6b2`
(19 members, `nov05-remote-7d93-artifact-review`) and
`75a0d4f1215ee051411561320710150e98cd8303e7a8016dddb66f2a78c63728`
(`nov05-current-7d-global-artifact-independent`). No workload was rerun by the
saved-evidence reviewer; this is agent engineering review, not human security
approval.

No image was published or deployed by this review. Current full browser,
ARM64/native target, staging, human review, advisory disposition and final
distribution qualification remain open. Later source changes require their own
artifact evidence. The upgrade is not release-ready.
