# Immutable CI image evidence work — 2026-11-04

This package binds the AMD64 CI evidence to the actual built image. It does not report a new remote execution or alter release qualification.

The retained f09 PR artifact identifies head f09a3dd7 and tested synthetic merge 3aca3b61. Its full candidate config ID is sha256:6b3f9671eb5868526fee6c345776e3e52a5367ea04832ce1fb55f57d5975c273. Native host/Docker architecture, source/tree/archive hashes and rootfs were retained. The CycloneDX SBOM and decoded Grype source retain the source label but do not carry that complete config ID, raw config or architecture. This is an evidence-binding gap, not proof of a different image being scanned.

The workflow now persists full candidate and previous image IDs immediately after their builds. Smoke, recovery and browser container creation use those IDs; the browser container's actual Image must match. Full image/container inspect JSON remains in the evidence artifact.

The documented Anchore download subaction supplies its absolute Syft executable. One explicit Docker-ID catalog operation produces native Syft JSON and the existing CycloneDX output. Native SBOM source metadata must match the complete candidate ID, exact source label, linux/amd64 and rootfs. The decoded raw config must hash to the candidate ID. Missing or inconsistent fields fail closed. Grype consumes this source-preserving native SBOM, and its output must satisfy the same image/config/rootfs assertions. No archive or tag fallback is used. The artifact adds those source documents, actual Syft identity and a file-hash binding receipt.

The original Grype v0.121.0, critical cutoff, fail-build policy, all findings, job deadlines, browser budgets/workers/retries, test actions, tax oracles and cleanup remain unchanged. Native source verification is required before scanning; scan failure remains a failure even if subsequent provenance verification succeeds. Public filing/2026/human readiness remains closed.

Validation for this private candidate is source-only: YAML parse, embedded Python compile, bash syntax, meaningful synthetic image-metadata tamper probes and structural preservation checks. The historical CycloneDX payload cannot satisfy the native source precondition; that rejection is not described as an actual new runtime RED. No new mirror tests are added for reversible workflow wiring. No fresh image build, smoke, browser, scan or remote pass is claimed.

The existing image run uses zero retries while tracing is configured only for a first retry. A separate trace-only proposal enables retain-on-failure without changing those retries or budgets. It is excluded from this immutable-binding package.

Evidence: `.local/upgrade-evidence/nov04-ci-immutable-image-sourcefirst/` contains the retained f09 source audit, primary-source proposal, before/proposed workflow, source checks and frozen forward/inverse. The original f09 results remain 555 passed/6 failed/5 hosted skips managed, and 545 passed/16 failed/5 hosted skips in the image; first failure blocks exhaust their respective 90s/30s deadlines. Those failures and skips are not cleared by source validation.

ROOT adoption against e8d0a2c5 preserves the independently reviewed workflow bytes (SHA256528a9aa9). Current-main YAML parse, every Bash body syntax check, both embedded Python compilations, identical pre/post checkers and diff check pass. Independent source approvale292485f and original twelve metadata probes remain bound to this exact workflow. The root receipt is `.local/upgrade-evidence/nov04-root-ci-immutable-main/receipt.json`. A fresh remote image/scan remains pending; no runtime result is inferred from these source checks.

Separate trace-only successor after commit8755e1f2 appends `--trace=retain-on-failure` to the unchanged zero-retry30s image browser command. YAML and every Bash body parse, exact workflow SHA2566826e689 matches independent compatibility approval2a44dc47, and the diff contains that single workflow argument. Actual new failure traces and remote qualification remain pending. Receipt: `.local/upgrade-evidence/nov04-root-ci-trace-main/receipt.json`.
