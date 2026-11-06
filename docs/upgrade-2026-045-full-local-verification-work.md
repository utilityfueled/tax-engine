# Exact 045fbedb full local verification

Application commit `045fbedbdfbe612cb3caa28956fa7228bb3df320`, tree
`cc964be84406697ce2b15e60f7d6c9cc148af2b7`, passes fresh unit and coverage
runs: **25,244 tests in 1,854 files, zero failures or skips in each run**.
Each run executes all six real PostgreSQL test files and their 53 assertions
against a new disposable loopback-only PostgreSQL16 cluster.

Coverage is 91.81% statements, 87.54% branches, 90.69% functions and 95.03%
lines. The 90/85/90/90 gates, normal five-second deadline, coverage fifteen-second
deadline and two workers remain unchanged. The ordinary run takes 547.32 seconds;
coverage takes 934.02 seconds, including process overhead.

Three typechecks, spec validation, spec inventory, both builds and lint all pass.
Lint retains 11,715 warnings and zero errors, with no semantic warning additions
or removals against the recorded b254 baseline. This is not a zero-warning claim.
The cluster stops, its port is free and its temporary directory is removed.
The tracked source remains exact after all checks.

A distinct engineering reviewer independently verifies 30 evidence checks:
the raw Istanbul totals, both result files and all six database case counts,
all 17 command-log hashes, Git blobs/modes/links, pinned samples/tools and lint
semantics. Stop/status logs, the absent cluster and a fresh read-only listener
check support cleanup. The runner's original listener-check stdout was not
separately retained; its predicate and receipt are reviewed. This is evidence
review without rerunning tests or accessing a database, and is not human
security, tax or release approval.

The private archive contains all 5,053 tracked regular files, six literal
symlinks and the separately pinned 15 public sample documents. Node26.13.0,
pnpm10.34.8, Python and pypdf6.10.0 remain pinned. The PDF operation marker runs
once; its estimate of 100 outputs is not an observed output count. The marker's
installed plugin path changed; its bytes match the prior pinned marker exactly.
The earlier missing-path admission failure is retained and occurred before any
test execution. No tests, assertions, thresholds or privacy gates were relaxed.

Evidence below is relative to `.local/upgrade-evidence/` and remains ignored:

- `nov04-pa-reuse-full-verification-source/actual/receipt.json`: SHA256 `b7f433383616b1e45d45d3d2d567fbf590e415ff21d3f0564b03ec86745497ff`.
- Source pins: `c11989501d4c81abc52a4a986e5eb65899ca5361d8f69aa6635ce1221f61b3a2`.
- Concrete configuration: `5c1ae00a544c1b2860a6e80978ca7c494ae7077aae8ab1f8c1c665e6a5c348f8`.
- Runner: `bc6230bb28bc98937dce97a9e22917773f44af35597810d126f81a37e2619b27`.
- Unit result: `13ba21be25eb42c9abf9d5f15afdca283a0148819a055a73fce61835cbbb610a`.
- Coverage result: `95fae4f1f30176a7432b45889253dd447a82afbb1b409e3ec7249b5ab199de94`.
- `nov04-pa-reuse-full-verification-independent/manifest.json`: SHA256 `6afd1d8e0710dfb84d11a2803be3054d4103f9f9af279857b0e8312eb770e212`.
- Independent review: `45475a29c89e4d32510e8f6526f6f1f298f89918dabfa26a11d4329449faa0a8`.
- Independent receipt: `39deabc615ac722f7a56bbd5c4f9c8ef6506e22a08e871c1c740e5aa83e5dbd0`.

The receipt is `PASS_FULL_LOCAL_CHECKS_ONLY`. Remote checks, actual final
hosted/native artifacts, independently reviewed AI runs, advisory dispositions,
professional review and qualified final2026 forms remain separate requirements.
This result enables no filing, model promotion, deployment or readiness claim.
