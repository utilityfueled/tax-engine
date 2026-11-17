# Narrow glibc package-build profile — November 17, 2026

The source correction is implemented and locally checked. It has not run the original glibc package suites under the new profile. It does not qualify a runtime image, approve generic ABI compatibility or record human security acceptance.

The completed AMD64 syscall prerequisite probe, run `44057386555` at source `9343d78a3106f7aac6d620bcab6a0215c78466df`, compared the builtin Docker profile, the exact official Docker 28.0.4 profile and a narrow derivative. Both original profiles returned EPERM for the two measured calls. The derivative restored the measured personality query/change/restoration semantics and returned EINVAL for the monotonic clock-set attempt. These observations establish a bounded prerequisite difference; they do not demonstrate that the full glibc tests pass.

The existing glibc runner executes its unchanged package script in an owned container. The correction applies the exact official profile, SHA256 `9c1025c88ccaa517b648da571961838744ea2137f176bfe6a48b21294cae9c76`, plus only these argument-filtered allow rules:

- `personality`, argument 0 equal to `4294967274`.
- `clock_settime`, argument 0 equal to `1`.

Only that owned package-build container receives the profile. Before starting its script and after closure, the runner requires the exact serialized policy, no added capabilities or privileged mode, network `none`, the unchanged script arguments and image environment with the three existing overrides, the readonly authenticated input bind and the original PostgreSQL-data tmpfs. Docker must be native Linux AMD64 version 28.0.4 with builtin seccomp. The exact package inventory must match the preceding probe's pinned inventory before execution. The applied profile, raw inventory and source binding are exported with the existing evidence.

The original authenticated-source and package scripts, baseline and candidate full suites, named allocator regression, strict ABI checks, command supervisor, ordinary failure evidence, 350-minute job / 340-minute controller / 20-minute cleanup limits, 40 GiB initial / 2 GiB reserve capacity gates and inherited cleanup are unchanged. The workflow adds the same 13 inert controls before its unchanged package command. This is a package-build experiment; the profile is not installed in the runtime image or proposed for a public deployment.

All 13 adopted controls pass, together with scoped ESLint, syntax checks and an exact whole-runner inverse against the pre-correction source. They exercise the real candidate build method with synthetic transport, profile and environment mutation, inventory drift, foreign mounts and after-state failures. They execute no daemon or package compilation. The historical inspection fixture retains only guard fields and documents its canonical input-path substitution; its original null security policy still fails admission. The hypothetical positive projection is not an actual observation.

The earlier syscall artifact did not export raw private package-inventory bytes; its executed controller checked equality. This successor exports the inventory so a future reviewer can repeat that comparison. Full glibc suites, allocator results, ABI evidence, runtime integration and the six consumers remain separate required gates. No failing test oracle or readiness assertion is removed.


Source manifest `ec9d5e29743b59ed05241f0dac1135ba65a3436a58eb19eb99775265e8f8c662`;
independent source review
`fe3e3d446b780e643ff7f10241d38bdb8703a8ed9bd26c3c4bff9d82b2e2205b`;
independent adoption review
`f469aee0726457c97c4dc50f4544ac56eb87208fd3edba9ff60f483a06b987a7`.
