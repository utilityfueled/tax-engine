# PDF compression buffer clearing

The completed remote 87e37df0 coverage run retains 20 unchanged five-second
PDF/workspace failures. A bounded V8 CPU profile identifies pako 1.0.11's
JavaScript buffer-clearing loop as a material cost when pdf-lib generates many
field appearances. The pinned pdf-lib, Decimal and TypeScript versions stay
unchanged. A local pako patch uses native fill(0) where available and retains
the original loop as its fallback. Compression options, hash strategy, stream
format, rounding, PDF content and qualification gates are unchanged.

The exact-version patch is registered in pnpm-workspace.yaml and the lockfile.
An isolated offline frozen installation copied 418 pinned packages successfully;
the main installation was unchanged during development. The lockfile changes
only the patch hash and its three existing pako consumers. Source provenance:
[pako 1.0.11](https://github.com/nodeca/pako/blob/1.0.11/lib/zlib/deflate.js) and
[pnpm 10 patch documentation](https://pnpm.io/10.x/cli/patch), refreshed October
27, 2026. The altered source is explicitly marked and retains its license.

The source contract precedes the compatibility test. Compressed bytes match
the unmodified published bundle for 64 input/options/buffer combinations and
six chunked full-flush streams. Independent Node zlib readers recover the exact
original bytes. Two additional fallback comparisons run in a child process with
native filling unavailable, preserving the test runner's globals. This checks
observable byte and reset behavior; no timing assertion or existing test is
weakened. The two tests pass in 520 ms, including 310 ms of test execution.

Six interleaved bounded coverage experiments retain three baseline and three
candidate runs. All three original tests pass in every run. Baseline aggregate
test times are 6.94, 6.34 and 6.54 seconds; candidate times are 5.53, 5.58 and
7.45 seconds. The slower candidate run remains retained. These local timings
suggest a benefit but do not establish the remote coverage gate. Every partial
coverage command correctly exits nonzero on unchanged global thresholds;
none is represented as a complete coverage pass.

Evidence is retained in `.local/upgrade-evidence/pdf-timeout-profile.json`,
`pako-zero-experiment.json`, and `pako-zero-source-checks.json`. The frozen
install log SHA256 is
`7a62ba7277058a5b1b7f86b01596d8f48cb88e7e62e0e7c4bfdd018b6074c7cd`.
The compatibility log SHA256 is
`fe3a52817b7ee5d9577be54114473af43e2213f0e3b0a07bdc0830362535e811`.
Root, contract and web types, 5,922 spec references, inventory and focused lint
pass. The complete PDF cohort passes 1,350 tests in 225 files with one worker
in 264.98 seconds; its log SHA256 is
`4dbafd3525daba499460fb92e7718fdc4401a9adcc64a7a4b152254e29d12e59`.
Independent review, production browser/build and current integrated coverage
remain pending at this source freeze.

The container dependency stage copies `patches/` before its frozen installation.
An actual local Podman linux/arm64 dependency-stage build passes with image
`50d2f897b9887b69aadd1f972795fc1903c7ed88862601191289a16569018311`.
A read-only container with networking disabled confirms Node 24.22.1,
pako 1.0.11, pdf-lib 1.17.1, the exact patch hash and installed deflate source
SHA256 `f537b12f55f31f9af74b162d0ad6b3667c78c356875f18c9f56be4db419d6ccc`.
The build log SHA256 is
`ba7fd4167d4dd9453b52d4ddfd95a82502a73cb12190c84dea9a266df40c62bb`;
`pako-deps-container-build.json` and `pako-deps-container-verification.json`
retain the commands' scope and results. This proves the dependency-stage
packaging only; final runtime images, scans and recovery remain separate gates.

Independent review clears the bounded source and packaging change. It verifies
all 3,597 regular files and six symlink targets in both snapshots, with only
Dockerfile and this ledger changed in V2. Separate controls make 70 exact byte
comparisons and 12 streaming comparisons, then reopen four saved PDF pairs.
Their eight paired pages are byte-identical and pixel-identical, with matching
amounts and appearances. The independent report SHA256 is
`d68bd1fb619841b5114a0b81f729c7f820ea4962c7b373d5f5e25480f4ad5454`.
Two reader-only setup corrections are disclosed in that report.

The exact candidate passes root and webpack web production builds and four
existing desktop/mobile education and K-1 workflows, one worker and zero
retries. Actual downloads are reopened by the existing PDF assertions; all
3,603 source hashes remain unchanged and the temporary loopback server is
closed. Browser log SHA256:
`fb97fd57a01d03e29b7fb1995937eb5140f3469ea26f7e4e89b937f859be875c`.
The full receipt is `pako-zero-v2-production/verification.json`.

A fresh full `pnpm audit --json` against these dependency inputs on October27
returns zero advisories at every severity. Audit SHA256:
`53e7d127130984cae97d554a54f7be42a21478066d94206e519540ab84119635`.
This package audit does not resolve the separately retained runtime OS
advisories or establish the final integrated coverage gate.

Main adoption performs a separate offline frozen install successfully, with no
downloads and unchanged versions. The installed source matches the reviewed
deflate SHA256 above. Main integration then passes 30 tests in five files,
including the new bond saved-output route, compatibility and pagination, root
types, 5,946 spec references, inventory and scoped lint. Test log SHA256:
`36ccebcafa7713d4e3ac2f4e356c239a6295eca0c00fdcd469bbe8065b9ab19d`.
Receipts: `pako-zero-main-install.json`, `pako-zero-main-installed-dependency.json`
and `pako-zero-main-checks.json`. Existing assertions, test deadlines, workers
and full-project coverage thresholds remain unchanged.
