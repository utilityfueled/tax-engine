# Standalone native AMD64 glibc source experiment

This separate opt-in workflow executes the existing Bookworm glibc source recipe.
It changes neither the SQLite workflow nor any runtime/release/scanner gate. No
workflow dispatch, toolchain build or package execution has occurred during its
source preparation. A future actual result is package evidence, never release,
risk, generic ABI, six-consumer, runtime integration or unfiltered scan approval.

Admission reuses the frozen source controller: public nonfork repository, manual
first-attempt default-branch dispatch, exact selected full SHA, unchanged source,
GitHub-hosted Linux native AMD64 and local Unix daemon without active containers.
The actual glibc instance overrides the inherited deadline and capacity methods:
350-minute job,340-minute controller including20-minute normal cleanup reserve,
40GiB initial workspace/daemon space and2GiB command reserve. It never lowers
those limits, retries, buys capacity or cleans unrelated state. The maximum job
is below GitHub's standard360-minute hosted-job limit.

All source inputs and recipe files pass the existing signed archive-chain
verifier. Optional injected gpgv/xz runners preserve their original ten-second
bounds and offline defaults while the executable path uses the owning sanitized,
logged, bounded command callback. Unknown child custody propagates unchanged and
prevents further daemon commands. The exact tracked public keyring remains pinned;
no keyserver, credential or HTML-as-binary fallback is used.

The native toolchain uses the exact official PostgreSQL16.16 Bookworm AMD64
platform manifest. Its unchanged source recipe checks the baseline libc version,
authenticated apt development dependencies, architecture and records package,
index, compiler/linker/build-flag provenance. Only the generic operation label is
inserted after FROM. Actual toolchain image identity is immutable.

The original package script is copied and hash-read back in a newly created
operation-labelled toolchain container. Exact staged inputs are mounted read-only;
network is disabled; no Docker socket or host write mount is provided. Baseline
and candidate full Debian builds/suites, upstream allocator regression and strict
abidiff remain unchanged. Using a stopped container rather than a package-image
build preserves the script's real nonzero exit and failure filesystem. A failed
script may export evidence, but its validator always rejects it.

Positive package evidence requires the exact completed status and normal outer
script exit0, every retained full suite without unexpected failures, the named
baseline FAIL/driver1 and candidate PASS/driver0, and actual expanded allocator
commands. The baseline must additionally report the pinned mcheck implementation's
specific `memory clobbered past end of allocated block` diagnostic; arbitrary
crashes, loader failures or timeouts do not reproduce this regression. Candidate
execution already present in the mandatory full suite may supply its actual
allocator command: no extra execution count is invented. Every ABI provider must
have raw stdout/stderr and the unchanged recipe must complete its zero-exit ABI
checks. Original XFAIL/UNSUPPORTED remain visible and cannot replace the required
named candidate PASS. These future actual predicates have not passed here.

The exporter verifies the complete original ARTIFACTS.sha256 regular-file ledger.
Legitimate package symlinks are allowed only in the raw unpacked subtrees and are
never followed or uploaded. All unpacked regular hashes and safe link hashes are
retained in an explicit export binding; raw package archives, full build/test/ABI
logs and toolchain evidence are uploaded without unpacked trees. The package
archives preserve reconstructable originals. Omission is explicit, not a claim
that those unpacked files were uploaded. Unknown aliases elsewhere hold.

The unchanged shared cleanup protocol normally stops and inspects only exact
new operation-labelled containers, removes without force/prune and preserves all
initial images. Partial cleanup/deadline failure remains failed. The standalone
source experiment supplies no taxpayer facts or credentials. GitHub artifacts
are retained three days and are not confidential storage on a public repository.
No image push, runtime package installation, deployment or model/provider action
exists in this workflow.

Official references:
- https://sourceware.org/pipermail/libc-alpha/2026-April/176841.html
- https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idtimeout-minutes
- https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#workflow_dispatch
