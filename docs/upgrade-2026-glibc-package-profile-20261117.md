# Narrow glibc package-build profile — November 17, 2026

The source correction ran in AMD64 job `44148810935` at `c2210167a2f6f749230eac259d5221026f7bb6d7`. The original baseline package build failed two CPU-feature tests. The candidate build, paired allocator regression and ABI comparison were not reached. This remains a failed package experiment; it does not qualify a runtime image, approve generic ABI compatibility or record human security acceptance.

The completed AMD64 syscall prerequisite probe, run `44057386555` at source `9343d78a3106f7aac6d620bcab6a0215c78466df`, compared the builtin Docker profile, the exact official Docker 28.0.4 profile and a narrow derivative. Both original profiles returned EPERM for the two measured calls. The derivative restored the measured personality query/change/restoration semantics and returned EINVAL for the monotonic clock-set attempt. These observations establish a bounded prerequisite difference; they do not demonstrate that the full glibc tests pass.

The existing glibc runner executes its unchanged package script in an owned container. The correction applies the exact official profile, SHA256 `9c1025c88ccaa517b648da571961838744ea2137f176bfe6a48b21294cae9c76`, plus only these argument-filtered allow rules:

- `personality`, argument 0 equal to `4294967274`.
- `clock_settime`, argument 0 equal to `1`.

Only that owned package-build container receives the profile. Before starting its script and after closure, the runner requires the exact serialized policy, no added capabilities or privileged mode, network `none`, the unchanged script arguments and image environment with the three existing overrides, the readonly authenticated input bind and the original PostgreSQL-data tmpfs. Docker must be native Linux AMD64 version 28.0.4 with builtin seccomp. The exact package inventory must match the preceding probe's pinned inventory before execution. The applied profile, raw inventory and source binding are exported with the existing evidence.

The original authenticated-source and package scripts, baseline and candidate full suites, named allocator regression, strict ABI checks, command supervisor, ordinary failure evidence, 350-minute job / 340-minute controller / 20-minute cleanup limits, 40 GiB initial / 2 GiB reserve capacity gates and inherited cleanup are unchanged. The workflow adds the same 13 inert controls before its unchanged package command. This is a package-build experiment; the profile is not installed in the runtime image or proposed for a public deployment.

All 13 adopted controls pass, together with scoped ESLint, syntax checks and an exact whole-runner inverse against the pre-correction source. They exercise the real candidate build method with synthetic transport, profile and environment mutation, inventory drift, foreign mounts and after-state failures. They execute no daemon or package compilation. The historical inspection fixture retains only guard fields and documents its canonical input-path substitution; its original null security policy still fails admission. The hypothetical positive projection is not an actual observation.

The earlier syscall artifact did not export raw private package-inventory bytes; its executed controller checked equality. This successor exports the inventory. The actual package artifact contains the exact inventory, applied profile and before/after container inspections. Independent saved-artifact review verified the original artifact ledger and every exported regular-file hash. The inventory SHA256 is `6808d09531eca150b5877373bf8d6ff95813eb142324954237d40c7cb46236cc`; the applied profile SHA256 is `1953cb173f8fa995ff1add66464210f60211b15764a002979b7635666fce892a`.

The package script exited 2 during `baseline-full-build`. Its libc summary records 2 FAIL, 5,111 PASS, 71 UNSUPPORTED, 16 XFAIL and 10 XPASS. Both failures, `elf/tst-cpu-features-cpuinfo` and its static variant, report exactly one mismatch: `HAS_CPU_FEATURE(XFD)` is 1 while `/proc/cpuinfo` reports no `xfd` flag. The i386 summary records 1,256 PASS and 15 XFAIL; x32 was cross-compiled and its tests were skipped by the original Debian recipe. This does not establish that either full baseline or candidate qualification passed.

The exact mismatch has an [official upstream test correction on the `arm/gcs` branch](https://sourceware.org/pipermail/glibc-cvs/2024q3/085609.html), commit `8c7c188d62d76acda1b273b0d4d9c3b32983b28d`, explaining that `/proc/cpuinfo` does not report XFD. That is evidence of a known test assumption, not a demonstrated defect in the runner or a claim of stable-branch approval. No test correction has been applied to the tracked recipe by this review. A separate source-only test-backport experiment is prepared for review; it retains the original failure. The existing strict rejection of XPASS remains: the 10 observed XPASS results are a separate unresolved gate, and fixing XFD alone does not establish that packages will qualify.

The ten XPASS identities are `elf/tst-ifunc-isa-1`, `elf/tst-ifunc-isa-1-static`, `elf/tst-ifunc-isa-2`, `elf/tst-ifunc-isa-2-static`, `nptl/tst-create-detached`, `nptl/tst-robust8`, `rt/tst-cpuclock2`, `rt/tst-cputimer1`, `rt/tst-timer` and `support/tst-support_descriptors`. In the authenticated original source, the four IFUNC expectations depend on `with-lld`; Debian's `testsuite-xfail-debian.mk` marks the other six as expected failures. The original `evaluate-test.sh` emits XPASS when an expected-failure test actually exits zero. These statuses are not failed assertions, but the stricter experiment gate still holds on them. Their expectations have not been changed; the exact run-specific `with-lld` value was not separately exported.

All 54 recorded commands completed; the package command was the only nonzero result. The package container was stopped with exit 2 and no OOM indication. Cleanup removed its one owned container and ran six owned-image removals, retained all six initially present images, and reported no cleanup errors or deadline overrun. The two final owned-resource listings were empty. Full glibc suites, allocator results, ABI evidence, runtime integration and the six consumers remain required gates. No failing test oracle or readiness assertion is removed.

The downloaded artifact is 47,908,531 bytes, SHA256 `f0a2bb2169ac4a3fa72ebb1b1b9b2af78fca95c37cbc91eaf14ae37917560f69`. Independent actual review: `7c58acb47e4aa163eb9ed4c47328f8f2126aefb2e1314af431d3f054701b2aa6`. Original unpacked build-tree per-test files were not exported; the retained package-build log includes the two complete failure blocks.


Source manifest `ec9d5e29743b59ed05241f0dac1135ba65a3436a58eb19eb99775265e8f8c662`;
independent source review
`fe3e3d446b780e643ff7f10241d38bdb8703a8ed9bd26c3c4bff9d82b2e2205b`;
independent adoption review
`f469aee0726457c97c4dc50f4544ac56eb87208fd3edba9ff60f483a06b987a7`.


The separate opt-in XFD experiment is now durably adopted, with its exact
upstream patch, signed-source authority excerpts and whole-runner inverse.
Root verified all 18 adoption pins, the single unsupported inventory entry,
all 24 inherited/experiment controls, and the complete browser source audit
after staging. Original recipe and runner remain unchanged. Source/adoption
review SHA-256 is
`4ec8f9dba1d92a0b7a8283b3e3aa080e84ea2140955df46c21c44e37dee0944f`.
Actual dispatch and all its qualification outcomes remain pending.
