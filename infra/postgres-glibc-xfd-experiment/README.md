# Test-only glibc XFD source experiment

This opt-in AMD64 experiment applies official upstream branch commit
`8c7c188d62d76acda1b273b0d4d9c3b32983b28d` to one test file before copying the
baseline to the allocator-fix candidate. It removes the invalid XFD comparison
with `/proc/cpuinfo`, retains both test registrations and all other comparisons,
and does not change glibc production code. The patch is from `glibc/arm/gcs`;
it is not presented as a stable Debian security backport or signature-verified
developer commit. Exact official HTTPS receipt hashes and signed-source member
authority are retained in `provenance.json` and the `authority-*` files.

The normal runner and package recipe remain separate. `experiment.mjs` first
requires the original authenticated preparation, exact recipe and complete
input ledger. It retains original recipe/ledger bytes and receipts, adds only
the pinned patch and before/after test files, and records the effective script
and altered oracle explicitly. `RUNNER-INVERSE.json` proves the exact six
source-hook/status-field substitutions against the normal runner. The derived
recipe's only other delta is its explicit altered-suite status field.

Original failure run `44148810935` and its ten XPASS results remain holds.
Neither expectations nor suite result rejection are changed. All other full
suite, paired allocator regression, ABI, native platform, seccomp, source,
capacity, deadline and normal cleanup gates remain. The original 350-minute job
and 340-minute controller include 20 minutes for cleanup; initial workspace and
daemon capacity remain 40 GiB each with a 2 GiB reserve.

The separate manual workflow runs inert original sandbox and experiment controls
before compilation. It publishes bounded diagnostic artifacts only, never a
runtime image. Even successful package evidence would leave runtime integration,
six consumers, image scanning, qualified human review and release qualification
as separate requirements. No risk is accepted by this experiment.

The authenticated upstream mail patch intentionally retains its original `-- `
trailer and trailing blank line. `git diff --check` reports those exact upstream
transport bytes; they are not reformatted because the complete vendor-patch
hash is the authentication boundary. Whitespace checks for authored files are
separate from this retained vendor artifact.
