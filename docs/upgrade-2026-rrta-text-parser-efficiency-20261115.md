# RRTA saved-PDF parser efficiency — November 15

Actual AMD64 browser failures reached the unchanged four-second saved-PDF privacy
child deadline. Profiling retained PDFs showed repeated parsing of identical
content streams during final text extraction. The scanner now reuses complete
successful parses only within one inspection, for exact bytes, forced encoding
and reader. It retains at most 4,096 entries and 8 MiB of input bytes. Mutable
operands are copied; unsupported references, streams, inline images, copy failure
and capacity exhaustion keep the original parser path. The original parser is
restored on every success or failure.

No page text or privacy verdict is cached. All typed content, raw graph,
resource/cycle, encoded marker, geometry and page-text checks remain; no marker
or privacy surface is removed. The four-second child deadline, 64-KiB output
limit, browser deadlines and zero retries are unchanged.

The specification preceded two genuine failing behavioral controls. A cursor
regression was caught and corrected before freezing. Author verification passes
59 privacy/efficiency tests plus strict-reference/type/lint checks. Separate
review reruns those 59 and adds eleven controls for mutable trees, readers,
encoding, subclasses, fallback, EOF, parser errors and restoration after failures.

Main passes 65 tests in three files, all thirteen spec references, the unchanged
1,030-row inventory and scoped lint. Both retained actual PDFs also pass the main
helper with all eighteen markers under the original four-second child limit;
all eight output fields exactly match the old helper. These are local ARM64
runs on saved AMD64 artifacts. Fresh AMD64 timing and complete browser
qualification remain required; the original remote failures are preserved.

Frozen three-file candidate: `1696e7a1ca22ffc257d937e04533ca7284d1ab4b50567dee82fc46b20e407a82`.
Separate engineering review: `a7e32d8c00f1e07446fb62104d977fc5ab4e589f156e63b9917bea767001f286`.
Root source review: `dcf1f0940f74f5fe53a5abcef7d24fb420a3a4fccd8bdd6850b96ebf530ed648`.
Retained evidence: ignored `.local/upgrade-evidence/nov15-rrta-root-review/`.
Only the helper source hash and dependent diagnostic binding change in browser
metadata; all 643 cases and prior execution/request policies remain. This is
engineering verification, not human privacy/security acceptance or release approval.
