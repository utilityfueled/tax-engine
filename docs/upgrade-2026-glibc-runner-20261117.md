# Native AMD64 glibc source experiment

The separate manual workflow executes the authenticated Bookworm glibc recipe
from commit f3b4dcb0. Whole-source root and independent reviews passed. Root
ran 17 focused controls across three files; lint and all nine affected spec
references pass. The author retained both genuine failing regressions.

The controller enforces a 350-minute job and 340-minute controller including
20 minutes for normal cleanup, 40 GiB initial capacity and 2 GiB reserve. It
retains full Debian suites, the exact upstream allocator regression, a specific
positive baseline tail-corruption diagnostic, candidate PASS and strict ABI
checks. Failure artifacts retain the real recipe exit; exporting them cannot
qualify a failed package. Unpacked files and links are explicitly hash-bound
but omitted from public artifacts; original packages and logs remain available.

Source manifest: `ed2de15a60aeada00ae89104ae0bba2539d164be43c107d31049a488de3cc74e`.
Independent review: `e5717b66db60672b5115d071d2876672a2a06f6a5ca1325f8336a33d1b6a6456`.
Root observed terminals: focused `74a62d/0`, lint `2e756d/0`, spec `2e756d/0`
and `2a5179/0`; all 24 source pins rechecked in `2aa02f/0`.

Compilation, binary regression, ABI and consumer/runtime integration results
are pending. This source review does not accept vulnerability risk, install
a runtime package, publish an image or qualify a release.
