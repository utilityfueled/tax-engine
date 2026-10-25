# Shipped Compose security and recovery

Verified locally on2026-10-25. Ordinary `compose.yaml` web starts now use a
read-only root filesystem, drop all capabilities, prevent new privileges and
provide only a64MiB `/tmp` tmpfs with `noexec,nosuid`. The PostgreSQL data volume
remains writable and persistent. The rehearsal override no longer supplies these
controls; its verification therefore exercises the shipped configuration.

The original configuration regression failed before the change. All61 focused
configuration/runtime-boundary/security tests pass. A six-phase isolated arm64
rehearsal then passed: previous image, upgrade, database restart, dump/restore,
rollback and re-upgrade. Every phase verifies uid1001, read-only root,
`NoNewPrivs=1`, zero effective and bounding capabilities, absent provider keys,
unchanged browser facts/original document bytes and exact database costs.
Podman expands `ALL` into individual capability names, so the harness checks the
actual kernel capability sets instead of relying on Docker's inspect spelling.

[Machine evidence](upgrade-2026-compose-security.json) binds the configuration,
harness and complete local log by SHA-256. The existing images are retained
intermediate candidates (`905d2842` and `c018a510`), not final application code.
This establishes the configuration change and synthetic recovery behavior;
final-image builds/scans, native amd64 rerun, staging and independent human
security review remain required. No image was published or deployment changed.
