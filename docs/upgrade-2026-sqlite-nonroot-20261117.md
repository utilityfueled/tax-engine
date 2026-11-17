# November 17 SQLite permission-test prerequisite repair

The second native source run44038687405 failed after the link correction.
Its baseline Debian package built; the unchanged full suite returned2. It
reported an injected-OOM assertion in `recoverfault2-2-oom-transient.2330`,
then the upstream `attach-6.2` guard aborted because tests ran as root.
The guard intentionally requires a permission0000file to be unwritable.
The OOM cause is unestablished and is not attributed to the later root guard.
All80owned checks, including60cleanup checks, exited0; recipe status remains1.
No candidate, paired-regression or sanitizer pass was obtained.

The repair keeps Debian package builds root and runs every upstream full,
paired and sanitizer harness command as a dedicated nonroot container user.
Only qualification work/output ownership changes. Full suites, original
permission and fault assertions, five paired cases, ASan/UBSan flags, strict
result gates and time limits remain. A new native run must still pass the
complete baseline; no test failure is excluded.

Root and independent17-test runs pass, including executing the real wrapper
and fulltest exit gate against inert commands returning0and2. These controls
perform no local user or ownership changes. All9,427spec references, inventory
and shell syntax checks pass. Native execution remains required.

Private failed-artifact diagnosis: `nov17-sqlite-second-actual-diagnosis`,
SHA256`16be97e3ab7d8241b20589f96e45c1242d7893525d6d21485b22116539aa7482`.
Source manifest `3bd3c0ad42de74792b79cedc0ba35051e4f18cc7c5832c31276677a506c305f8`;
root review `0cff7f5b613e8ef4ac964d740ad327beb78a525172d043a8fbff567281944161`;
independent review `25b64cf16dcba4be03b53f86f998c298c21739fa6da1c79a6ce84f976aec3418`.
No runtime image integration, advisory acceptance or release qualification.
