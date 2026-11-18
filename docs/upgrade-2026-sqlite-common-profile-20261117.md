# SQLite common profile correction

The common source prerequisite now preserves Debian's legacy rowid-in-view
feature while repairing its resolver and qualifying its test expectations.
The separate CVE patch still applies only after the common baseline is split.
There is no new Linux package, full-suite, sanitizer, ABI or runtime qualification.
The earlier 134-error baseline remains a failed result.

The original three prerequisites remain byte-for-byte unchanged. Sixteen further
source files adapt official SQLite commits
[daee74c3](https://github.com/sqlite/sqlite/commit/daee74c3ac0112ecaca4817954f0394454050065)
and [296ae1e4](https://github.com/sqlite/sqlite/commit/296ae1e4673151e59593105b653e87eceae25163)
to SQLite 3.40's existing syntax tree. This is an adapted backport, not an exact
cherry-pick. The broad upstream fuzz-name heuristic is excluded: every original
fuzz assertion remains. Production feature flags are retained.

The twentieth source file corrects the I/O test's expected default page size to
the minimum of simulated sector size and the configured read-only page cap.
Debian configures 32,768, while the old test hardcodes 8,192 for a 16,384-byte
sector. This locally derived oracle correction has explicit source provenance
and no upstream-commit claim. Original test bodies and all eleven historical
input vectors remain; two upper-bound cases are added.

Host ARM64 semantic checks, separately scoped from package qualification:

- Legacy resolver: original 5/13 pass; adapted 13/13 pass. Standard build:
  original 12/13 pass; adapted 13/13 pass. Both runtime modes on the enabled
  build pass 13/13 each.
- An attempted activation in the compile-disabled build exposed a mistaken
  probe expectation; that failure is retained. Three separately predeclared
  controls pass, confirming the API returns success/value zero and leaves view
  rowid disabled. The controlling API implementation is in daee74c3.
- The same native I/O binary reproduces 1 error/29 original tests and passes
  0 errors/31 corrected tests. Both runs initialize the same standard Tcl
  library. The initial missing-library attempt remains unavailable. The six
  atomic-write vectors follow their original feature gate and were not
  executed on this host; both new cap-boundary cases executed.

The processor checks all twenty transformations before writing and retains file
descriptors. It rechecks live paths, inode identity, regular/single-link status,
size and exact bytes after receipt reservation, around each write and at the
end. It requires an exclusively owned build tree. Failure can leave partial
writes, reports failure and never claims atomic rollback or protection from
hostile concurrent writers.

Validation passes: 28 Python controls, 58 retained SQLite Node controls,
19 Vitest tests, spec validation and scoped lint. The Python controls execute
from the regular Vitest suite. All twenty actual source transformations and
eight recipe hashes were independently verified; the 37 GPG closure members
are unchanged. All downstream qualification gates remain required.

Private source authority: `nov18-sqlite-combined-custody-successor/MANIFEST.json`,
SHA256 `55508ed53100e624b64951a11d1ad48ea5d5db30a8d25f37b51fe251ff9155d4`.
Independent review manifest: `nov18-sqlite-custody-successor-independent-review/`,
SHA256 `864c2ce98e0c9bbd1c313028561c707062f0ac8da15bc8ca92359c4d7958df9b`.
Native receipts remain in `nov18-rowid-host-native-root/` and
`nov18-sqlite-io-host-arm64-proof/`; root checks in
`.local/upgrade-evidence/nov18-sqlite-root-adoption/`.
