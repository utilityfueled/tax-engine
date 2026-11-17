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

Actual full-package execution of this profile remains pending. It grants no
runtime, ABI or advisory acceptance. Sources: [DBPAGE](https://sqlite.org/dbpage.html),
[compile option](https://sqlite.org/compile.html#enable_dbpage_vtab),
[recovery](https://sqlite.org/recovery.html).
