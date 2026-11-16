# Preserve exact archive failure predicates — November 16, 2026

The independent archive verifier retains fixed equality results for the loaded
image list, the complete existing image signature and the unchanged archive hash.
The signature diagnostic identifies only which of nine fixed fields match. It
does not retain configuration values, environment values or command output.
Configuration comparisons pass through standard input, not process arguments.
Checks that have not run remain `null`.

The exact original rejection checks remain: one expected image ID, byte-identical
normalized signature and unchanged archive SHA256. Wrong or additional IDs fail
before image inspection; a signature mismatch still fails before hash verification.
Owned scratch cleanup and every source, native-store and capacity gate remain.

The preceding application-source `c0760d2b` strict workflow
[43896502464](https://github.com/utilityfueled/tax-engine/actions/runs/43896502464)
retains 644 browser passes, six deadline failures and five original skips across
all 655 cases. Its ordinary self-host browser job passes. The strict archive
receipt reports `verify-loaded-image`, `archiveImportVerified:false` and
`scratchRemoved:true`; it cannot distinguish the failing predicate. The new
diagnostic does not retrospectively establish that cause or qualify that run.

Validation: spec first, seven new diagnostic failures with fourteen original
passes before implementation, then 35 focused archive/scanner-contract checks
pass. Tests exercise wrong/additional IDs, environment/layer/entrypoint/label
mismatches, exact success, non-disclosure and the existing store/custody failures.
Scoped lint, shell syntax, all five spec references and diff whitespace checks
pass. Independent review also passes all 35 checks and confirms the three
original rejection checks are byte-identical (review `a22db6e9`).
An initial `tsx` CLI sandbox pipe denial is retained; the project's direct
`node --import tsx` validator passes without that CLI server.

Root evidence: RED `8718/1/3be4a6`; final focused `51902/0/2680e9`;
lint/shell/diff `e03ba7/0`; spec `6b19fe/0`. The original CI log and provider
artifact are retained privately, including archive receipt and all eight browser
batch reports. This changes diagnostics only and establishes no new runtime,
security, filing, model or production qualification.
