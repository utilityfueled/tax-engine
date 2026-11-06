# Exact6e15 local, managed and image runtime evidence

Source `6e15b4fea86eafc2f2b0bb19aed692448ad37e1e`, tree
`adf9ce90d0e9892dee6ba4d83c146e7f9e944f7a`. Results below describe that
source; subsequent fixes require their own verification.

## Local checks

All twelve checks pass with 5,452 regular source-file hashes unchanged:
model-evaluation contracts, three typechecks, spec validation/inventory, both
builds, lint, unit and coverage. Unit and coverage each pass 27,083 tests in
1,949 files, including the actual local PostgreSQL lane. Coverage is 91.82%
statements, 87.67% branches, 90.91% functions and 95.13% lines, above the
unchanged 85% branch gate. The full browser run passes 585 cases with five
original hosted skips, zero failures, the unchanged managed90-second normal
collection default, two workers and zero retries. Three pre-existing native
case files retain their explicit180/180/240-second body overrides. This is not
a strict30-second global result. Its owned runtime closes; skipped hosted tests do
not establish hosted readiness.

The separate [CI workflow](https://github.com/utilityfueled/tax-engine/actions/runs/42185838214)
also completes all six jobs successfully.

## Managed browser result

[Web workflow](https://github.com/utilityfueled/tax-engine/actions/runs/42185837835)
job 127786011856 fails with 584 passed, one failed and five original hosted
skips across 590 cases, without retries. Both railroad paper PDF cases and both
railroad payroll cases pass. The remaining failure is the 1280px complete local
lifecycle's literal first-name search over serialized encrypted recovery data.

The downloaded artifact has 139,056,438 bytes and SHA-256
`6097afd6b106ee7053102fc4902c542d15da6d2db887a9e63e0be6afce5fafcc`.
Authenticated AES-GCM decryption of both saved backups succeeds using the
existing synthetic test password. Workspace, guided facts and original document
bytes match the saved source exactly. The failed backup has one name-token
match exclusively inside randomized base64 ciphertext; its nonciphertext fields
contain no tested plaintext marker. This identifies a faulty ciphertext
substring oracle. The original journey remains failed; no plaintext leak is
established. The separately committed [correction](upgrade-2026-encrypted-recovery-evidence-work.md)
subsequently passes independent review and both actual local journeys. That
evidence does not turn the original failed6e15journey into a pass. Historical
mode/mtime values lack independent pre-export oracles in this old artifact.

## Actual image and recovery

The actual Linux/AMD64 candidate is
`sha256:7edb571418e9e22691de12e5e622da8005c110808ed823f96a682234eb73bb7d`.
Checkout1fc826ed has the exact6e15 source tree. Image/rootfs/config,2,883-component
SBOM and scan bindings pass independent artifact checks. All six synthetic
Compose upgrade/restart/restore/rollback/re-upgrade phases pass with exact
row/fact/document digests and previous/candidate image bindings.

Actual image browser outcomes are558passed,27failed and5original hosted
skips across590cases, with0retries. The CLI explicitly uses30000ms; original
per-body exceptions remain unchanged.25failures reach test deadlines and two
railroad paper inspectors return the safe `[timeout]` category at their original
4000ms child boundary. Those two inspectors return no privacy verdict. Direct
result statuses are6timedOut/21failed; error categories are25case deadlines
plus2child deadlines. The cause remains unproved. This runtime is unqualified.

Artifact13490224603 has766,687,251bytes and SHA256
`f6d3e50ed5bf1cf6821292dd69aa8977f21d2a72088fa9f3c7480db76051c43f`.
The scan retains182matches/81IDs, including62Highmatches/19HighIDs and
zero fixed-version matches. Every per-ID count, severity and package-version
set matches the [current register](upgrade-2026-image-advisories-20261106.json).
No primary-source refresh, risk acceptance or deadline extension follows from
this comparison. The browser cleanup receipt and workflow cleanup step complete;
independent post-removal container absence was not proved.

Prior b1 evidence remains separately bounded in
[the prior runtime ledger](upgrade-2026-b1-runtime-evidence.md).

## Qualification limits

These results do not establish hosted outage/automatic-retry qualification,
native ARM64 recovery, independent human tax/AI/security review, final annual
2026 forms, filing or model promotion. All corresponding gates remain required.
