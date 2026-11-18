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
run44198188977 is still pending. A separate source-reviewed extension must also
compare the original distribution provider with the same candidate: common-profile
baseline comparison alone does not cover the common feature/profile changes.
[Source contract](../spec/ops/sqlite-exported-abi-native-amd64.yaml),
[harness](../infra/sqlite-exported-abi/README.md).
