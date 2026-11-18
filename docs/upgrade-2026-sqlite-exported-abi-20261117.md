# Exported SQLite ABI diagnostic

The reviewed manual-only AMD64 harness decodes genuine closed source-candidate
artifacts before materializing tools. Both baseline/candidate library packages
and corresponding debug packages must pass the bounded decoder, build-ID,
debug-link CRC, DWARF, ledger and source checks. Missing pairs hold before
native tool materialization. No SQLite is rebuilt in this diagnostic.

The original source recipe must equal the reviewed toolchain recipe. Tools are
newly materialized from the immutable AMD64 base, authenticated exact Debian
packages and byte-bound installed executables. Each command uses a separate
owned, read-only, network-disabled container. Original controller supervision,
capacity, cleanup and source admission remain. The job/controller/cleanup limits
are 35/32/3 minutes; the ABI subwindow is four minutes. Every nonzero or incomplete
command holds. `abidiff --fail-no-debug-info --no-default-suppression` retains
all original checks.

Only two files containing fixed safe metadata, hashes and counts are published.
Raw ABI outputs and packages remain private; independent raw-output review is
explicitly unavailable. Diagnostic success cannot supersede a failed package
qualification or assert generic ABI, runtime, release or risk acceptance.

The author manifest is
`01b4e5397241fb57ef329388402122619e10d2dc61ba9229ccc11db9c04d8311`;
independent source review is
`e1dafe86d7fe8a5dc1ac8f873ab16be784eeb22768f799185744c818b2e0c7d3`.
Root verified all 42 frozen pins and adopted 16 paths. An agreed README sentence
now identifies the actual workflow deadline. Root scoped lint found the inherited
missing explicit `URL` import; that import and its execution-input hash were
corrected, with the initial failure retained. Fourteen Node and nine Python
controls, scoped lint, actionlint, spec, inventory and browser audit passed.

No native ABI execution or candidate result is claimed. Current complete-package
run44198188977 is still pending. The separately reviewed extension below also
compares the original distribution provider with the same candidate; neither
comparison has executed yet.
[Source contract](../spec/ops/sqlite-exported-abi-native-amd64.yaml),
[harness](../infra/sqlite-exported-abi/README.md).

## Original distribution comparison and closure rebind

The exact official library/debug pair is now a third explicit input role.
Independent signed-index research binds both packages to the Debian and Debian
debug archives. The decoded original library matches the immutable installed
provider, SHA-256
`2e6eef9a727f081f0d453b4e5e6cbd8b9ef8b6f86cbf7681cbad444d3b0b55c8`.
The official whole library package differs from the saved rebuilt package; ELF
identity does not imply package identity. Build-ID, CRC and DWARF checks bind its
corresponding debug file. Signed releases are dated July11 and were retrieved
November17; this makes no additional freshness claim.

The original strict common-baseline→candidate comparison remains. A separate
original-distribution→same-candidate comparison must also exit zero without
suppressions, inside the unchanged shared 240-second diagnostic window and
35/32/3-minute job/controller/cleanup limits. All existing original source gates,
private raw outputs and broad qualification holds remain. Both matching pairs
are required before tools run. Exact five tool versions are present in the
verified current Bookworm index; actual installed version/byte equality remains
unproven until materialization. No substitute or automatic retry is introduced.

Author manifest:
`f2b752121fb215fd8515b754caa2465d4a2680b8f5aa74dae76f04c4e75929b4`.
Independent source review:
`e930eea94d506e558acf65a30cbb9adc95824be388bbd7faed28f0d3291a864e`.
Root verified all106 ABI/rebind frozen pins before15 exact public adoptions.
Thirty-seven Node and16 Python controls, lint, actionlint, spec, inventory,
browser audit and current source closures passed. The GPG CLI changed only its
source list; 28 original paths union13 ABI paths yields37, with23 original pins
unchanged. Independent rebind review:
`2b90a7ab08b5646215e95fef8338cc2d5e03ac1b437282dd9bbd6adcc5db4c68`.
No ABI/runtime execution or release qualification follows from these controls.
