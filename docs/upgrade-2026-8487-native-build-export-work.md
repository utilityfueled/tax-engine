# Exact8487 native ARM64 build and failed export

The November 4 operation binds source
`8487fb4b6d8818d83739fb902fc0730e19698053`, tree
`ce8f9746fb424f6efe52238076bca6a510e272c8`. It is separate from the earlier
pre-build store-inspection failures, which remain retained.

The same-parent native Linux ARM64 build exits 0 and produces immutable image
`c23e86d4acd3be5f90b7fa5c0a6ccb41dd291a4028c38b0e7020c8490354203b`.
Saved candidate and pre-export inspections are byte-identical and carry the
exact source revision. This establishes build completion, not image qualification.

Saving that exact image ID as an OCI archive converts its config to
`53430a2dfbae7b69f09d1b29da0cdeeba46f7c58fe19a2d9978d8ae3c3d9133f`.
The saved comparison verifies all nine rootfs DiffIDs, application configuration,
revision, user and history, but the OCI config omits the original healthcheck.
The strict ConfigID check correctly rejects the archive. The original raw Docker
config was not retained, so healthcheck omission is not claimed as the only raw
byte difference. These records do not support wrong-image selection.

The operation ends **FAIL_FINAL_SAFETY**, retaining the earlier failure
`archive config identity differs`. Final available disk is 17,107,730,432 bytes
against the unchanged 17,179,869,184-byte floor: a 72,138,752-byte shortfall.
Final memory is 6,968,434,688 bytes. Default-store metadata and workload checks
pass and the owned API stop command exits 0, but the combined final safety gate
does not pass. No resource floor was lowered and no retained store was repaired.

## V5 correction and recovery remain pending

The frozen source-only V5 successor changes candidate export to Docker archive,
retains exact immutable ConfigID and every uncompressed-layer check, and adds
exact raw-config healthcheck equality. It retains the restart, same-store identity
and independent empty-store import checks. Original base/previous-release OCI
verification, source pins, budgets and safety guards remain unchanged.

V5 has no actual Docker export or import receipt. The owned-space recovery
proposal likewise has no measured reclaim, pinned intermediate deletion list or
removal receipt. It requires bounded inventory and separate review before any
exact owned-only removal; no prune, force removal or global cleanup is authorized
by that proposal. Recovering only the measured shortfall would not prove that
later import phases fit.

The separate existing-candidate export adapter is also disabled and source-only.
It requires actual scoped-cleanup evidence and the same running VM boot before
attempting strict export of this exact candidate; it cannot pull, rebuild or
repair a store. A future successful export would have its own bounded recovery
status and would not turn the original failed final safety result into a pass.
Its cleanup, recovery and later-phase receipt fields remain unset.

Restart/import, same-image smoke, synthetic recovery, reciprocal/full browser,
SBOM/scan and final-source qualification remain unexecuted for this candidate.
Historical AMD64 and ARM64 results retain their original source boundaries.
No image is released, no advisory risk is accepted and no hosted, filing or
professional-review gate is satisfied by this build.

## Retained evidence

- Actual operation: `.local/upgrade-evidence/nov04-native-isolated-storage-source-first/future-final-qualified-phases-v4/actual-build-export-2cda01ea016b/receipt.json` (SHA256 `69ca087eaef005da39a4d2c722db385ecc78128bb2e7ce11badf7b474a9809d1`).
- Saved format/identity comparison: `.local/upgrade-evidence/nov04-native-export-format-sourcefirst-v5/saved-identity-proof.json` (SHA256 `ae990a20ff31b89ddad7e56e5ad03ecfa2db1644b20dc6bee33833c171acfdbf`).
- Source-only correction: `.local/upgrade-evidence/nov04-native-export-format-sourcefirst-v5/{manifest.json,v4-to-v5.diff,source-check-receipt.json}`; manifest SHA256 `19492bf9c38defc5789d2e4af09c14e7a219b22cc940648c1f3e748704c126d6`.
- Pending recovery boundaries: `.local/upgrade-evidence/nov04-native-export-format-sourcefirst-v5/owned-space-recovery-proposal.json`.
- Disabled exact-candidate recovery: `.local/upgrade-evidence/nov04-native-existing-candidate-recovery-sourcefirst/{README.md,manifest.json,recovery-config.json}`.
