# Fresh ARM64 runtime attempt — November 16, 2026

Application source: `c01803082b74db96a90ccb2e8433cd3b40877c1c`.
This attempt built and imported the image, then failed before the qualification
workloads. It does not establish runtime, recovery, browser or release readiness.
All commits through `80547c1b` were pushed to main and the backup branch;
Vercel's production build for that commit was observed canceled.

## Initialization and retained failures

A separate disposable AppleHV VM was initialized from the pinned official
Podman ARM64 image, with no host volume exports: two CPUs, 8192 MiB RAM and a
384 GiB disk. Existing VMs and their stores were preserved.

Two earlier initialization attempts remain failures. The first stopped before
initialization because it expected mode 0600 for an official configuration file
that was mode 0644. The second reached the CLI but inherited a 1 MiB file-size
limit, interrupting raw-disk creation. Its 1471-byte partial disk and lock were
preserved by an exact rename after checking that no process held them open.
Neither attempt booted a VM.

The corrected supervisor retains bounded captured output while allowing the
explicit initialization command to write its approved disk image. Nine real
child-process controls pass, including retaining output overflow as a failure.
The subsequent initialization completes with 15 CLI steps and no boot.
Distinct root and independent saved-artifact reviews verify its receipt. An
unbooted initialization is not evidence of guest capacity, empty stores or
normal stop.

Initialization receipt SHA-256:
`860c8b5a9b8a11fb1b588e6201a48e690917f034ca3e80803f0fc3f968f27b62`.
Root saved review:
`9ebc8aa5f24267512a4e0fc0ffe919f45bd7dd5a92de9919c6c1712509f669fe`.
Independent saved review:
`46aa1a60084a27624dbe19ba3320a7f05a3d0b5e3645a1699bb3f5039b1bb9fb`.

## Actual runtime result

The root-observed invocation exits **1** after approximately 119 seconds.
Thirteen prefix stages and the normal-stop step exit zero:

- First boot and guest custody checks, including empty stores and capacity.
- Exact public source and historical rollback-image transfer.
- Native candidate build, archive transfer and hash verification.
- Independent import and candidate/rollback image inspections.
- Normal VM stop and restoration of temporary resources and socket routes.

The relay retains an older VM's exact socket-name assertion, so it exits and
the controller stops before the Compose version check. Its subprocess also
explicitly selects `/usr/bin/python3`, which resolves to CLT Python 3.9 rather
than the controller's pinned interpreter. The earlier source reviews missed
this reachable relay contract; both root and independent reviewers record the
miss. There are zero completed workload outcomes. No smoke, runtime scan,
Compose recovery or browser result is inferred from a successful build/import.

Saved receipts report no deadline breach or cleanup errors, normal stop, all
VMs stopped, resources restored and original default/socket routes preserved.
Fresh root process checks also find the owned controller absent and no exact
run/relay process. The failed attempt consumed the genuinely unbooted witness;
it cannot be reused as proof that this VM has never booted.

Runtime source manifest:
`06c1ca497cd9679b8f70c674ce1f476d3b321f0734ab49ee65d9e8a4945f5c00`.
Root failure/closure acknowledgment:
`7129c831742e00b0beeb6e48716ef2f42723a94ce12104eefa41772ae0dcf519`.
Independent failure/closure review:
`d2f8fdb46a2ea0ff82e8a87181e1a03d6339f7f5f8f26c10644f2e543ca5ec97`.
A passing review here means that the failure and cleanup were verified.

## Correction and next execution

The narrow source correction preserves the exact socket guard with the correct
VM basename and inherits `sys.executable` for the relay. A prelaunch check binds
the VM names, socket assertion and interpreter across reachable helpers. Seven
relay contracts and eleven adapter controls pass; the predecessor fails the
socket contract. Root and independent source reviews pass. This is source
preparation, not a successful retry.

A separate saved-result reader correction follows the actual wrapper's two
explicit custody/workload flags. Sixteen receipt controls and 33 admission/fresh
initialization controls pass, including rejecting missing, false or truthy
substitutes. The failed run is never submitted to the success reader.

Root correction review:
`bd0fd8e91468718198ca053402a6871a135e1ad304bb56b2fc55f50de960cd1d`.
Independent relay source review:
`9b02dc701142c3010bdcfebcf5701950374b301cff79dfc7145b75290fe93549`.

Continue with reviewed cleanup of only the new disposable synthetic VM,
genuine fresh initialization, and all 24 runtime stages. Preserve the failed
run and host image/archive evidence. Keep the original deadlines, capacity
floors, privacy controls, browser policies and readiness gates. Existing VMs
and stores remain outside that cleanup scope.

Current local checks and protected Preview results remain separately recorded.
Signed hosted credit delivery/replay proof still needs the browser unlocked;
required human tax/AI review, final 2026 forms and security/advisory disposition
remain open. No production deployment, filing/model promotion or paid provider
call is part of this runtime attempt.
