The retained `upstream-distinct.test` is the complete authenticated public-domain
upstream regression file after the pinned patch. It is a test input, not a runtime
dependency. Its bytes independently reconstruct from the held Debian source
and the committed zero-fuzz upstream patch.

The flat recipe helper extracts the original bootstrap, all five appended
cases and finish_test after exact input, block and output hash checks. The full
input remains in native artifacts. Both compiled variants and the sanitizer
use identical derived bytes and retain the original filter and status oracles.

The old filtered script executes unguarded legacy setup after omitting the
setup test. Source isolation repairs that harness error; it does not establish
baseline reproduction, candidate correctness, sanitizer success or release.
