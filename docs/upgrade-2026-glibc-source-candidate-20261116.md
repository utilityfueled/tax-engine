# Bookworm glibc source candidate — November 16, 2026

The standalone source package backports upstream commit
`839898777226a3ed88c0859f25ffe712519b4ead` for CVE-2026-5450 to Debian
`2.36-9+deb12u14`. It changes no application image, deployment, scanner
policy or readiness gate.

The preparer authenticates the exact Debian source through three reviewed
archive signatures and the signed source index. The patch preserves all three
allocation fixes and the complete upstream allocator-checking regression;
only Makefile context is adapted for Bookworm. The native recipes require
paired baseline/candidate builds, full original suites, positive baseline
reproduction, candidate regression success and shared-library ABI equality.
A separate coherent runtime installation recipe retains PostgreSQL executable
bytes and locale names.

Validation and review:

- Spec-first missing-module and signing/admission failures remain preserved.
- Four focused tests, lint, shell syntax and all four spec references pass.
- Root ran ten focused checks across both source packages (`536dfb/0`), then
  glibc lint, shell syntax and spec references (`bdfdb9/0`).
- Root independently prepared a new authenticated offline context: three source
  files and three reviewed signatures passed (`4e81a5/0`).
- Author report SHA256: `a6e183d001b5c357b78597f5c2718e46f6c4ada498203d640363893ab8b31421`.
- Independent whole-source review SHA256:
  `5a13eb07b476a7b9ec22d731dba910d5811181a79ab22656e47f16428c62d4f0`.
- Root adoption review SHA256:
  `6249a3e1b7c4376d9cbc2e672c45b6e840855776960476e4097eec39903c7524`.

Compilation, binary reproduction, full-suite execution, ABI/consumer results,
runtime installation and archive-bound raw scans remain pending. The new
source package clears no advisory. Release qualification, generic ABI approval
and risk acceptance remain false.

Sources: [Debian tracker](https://security-tracker.debian.org/tracker/CVE-2026-5450),
[upstream fix](https://sourceware.org/git/?p=glibc.git;a=commit;h=839898777226a3ed88c0859f25ffe712519b4ead),
[Debian archive keys](https://ftp-master.debian.org/keys.html).
