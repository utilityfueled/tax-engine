# Common SQLite recovery profile — November 17, 2026

Full-package run `44190069976` built the compatibility-repaired baseline but
failed fulltest at `recover.test1.1.2`. Its core compilation omitted DBPAGE while
the recovery CLI already expected it. The authenticated source requires that
module. Earlier paired run `44184632007` isolated the same single feature flag:
core availability changed false to true and synthetic recovery exit 1 to 0.
No fresh native query on the failed full-package build is claimed.

The recipe now adds only `DEB_CFLAGS_APPEND=-DSQLITE_ENABLE_DBPAGE_VTAB` to the
existing package command shared by both variants. This enables a real core
page-access feature. The complete original shell is recovered byte for byte
by removing that one prefix. All original tests, fulltest/alltest/fuzztest,
baseline named vulnerable failure, five candidate and five sanitizer passes,
signed inputs, other flags, nonroot execution, deadlines and cleanup remain.
The original three common source corrections remain separately identified.
ABI, actual consumers, archived scans and release qualification remain open.

Three spec-first regressions failed before implementation, then passed; all
18 adjacent tests and 11 scoped spec references pass. Root independently
repeated the failing/passing transition and adjacent checks. Source manifest:
`fadfd90bec3a7423dd7109b0860beea87de1ebd617692908be0b4238d199d3c6`.
Independent review:
`70111176e28c53e89064bf3b3a24fcfb3c7470faaba39aebc0c8547217259d68`.
All seven adoption sources and 45 external inputs match. A root Vitest recheck
changed only a disposable cache included inadvertently in the private manifest;
the later review records 96/97 total matches and preserves that discrepancy.
The original manifest was not rewritten. No cache is an adoption input.

The actual full-package result is recorded below. It grants no
runtime, ABI or advisory acceptance. Sources: [DBPAGE](https://sqlite.org/dbpage.html),
[compile option](https://sqlite.org/compile.html#enable_dbpage_vtab),
[recovery](https://sqlite.org/recovery.html).

## Actual full-suite result: failed

Run44198188977, source dc2185dacedbd11595b6d7fd39b03570669e9c49,
failed November18 at00:34:35UTC. The baseline package built, and its complete
alltest reached5,550,419 tests with134 errors (126unique IDs). Baseline fulltest
exit2 and recipe exit1 preserve failure. Candidate package, paired CVE and
sanitizer stages were not reached. No ABI/GPG runtime dispatch is appropriate
without the corresponding real pair.

The errors span io6, join5 eight, misc2 eighteen, misc8 eight, returning1
twenty-four, rowid fifty-four and trigger9 sixteen occurrences. Source review
identifies configuration disagreements: Debian enables legacy view-rowid behavior
and raises the maximum default-page cap from8192 to32768; the old upstream
tests include contrary assumptions. For io-5.5, simulated16384-byte sectors
yield16384 while the upstream literal expects8192. This is a source-backed
profile/oracle finding, not permission to remove features or weaken assertions.
Official rowid compatibility history and a configuration-correct page-cap
proposal are under separate review; neither is implemented or runtime-qualified.

All88 recorded controller checks exit0; owned remaining-container/image checks
returned empty, cleanupErrors is empty and deadlineExceeded is false. Reviewers
performed no separate live post-cleanup inspection. The artifact ledger verifies
36files,37exportbindings,eight recipe pins and seven adoption pins.
Artifact14384429094:62,491,963bytes, SHA-256
`ef878e89987438716fb18988be3d181da6be2e15d68fa8422e71383178288043`.
Actual assessment:
`b196e6125492a432e5109e28eb5e6594da2e43bde3674b67964618aa194ae306`;
frozen manifest:
`2660858cb2d1c4b6ae0e3a53fcd56f3c9fbc414b8addd5b365ec0ac58a05141f`.
The earlier recover.test abort and all original failure evidence remain.
