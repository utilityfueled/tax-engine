# Separate SQLite upstream experiment

The successful targeted diagnostic reproduced Debian SQLite 3.40.1's original
join8 rowid and recoverfault2 OOM failures. This opt-in experiment preserves
those baseline and DBPAGE phases, then extracts a fresh authenticated tree.
It applies only three exact upstream file hunks, retains the original build
flags and complete recoverfault2 script, and runs both whole target scripts.

The [official rowid-capability change](https://github.com/sqlite/sqlite/commit/f891ef8d6111c8c8aa7de74bcd36aaf2f4569c47)
exposes SQLITE_ALLOW_ROWID_IN_VIEW to the test harness and makes join8's oracle
conditional on that actual flag. The
[official recovery change](https://github.com/sqlite/sqlite/commit/73a50fa42cbc2ddd1bf9e795a1407c3c746896e9)
checks the table-name conversion for NULL before use. Only that recovery hunk
is selected; unrelated changes in the commit are excluded. Its mechanism is
consistent with the observed syntax-error category, but the historical OOM2330
allocation's exact location remains unproven. Neither change is represented as
a verified stable-branch backport.

Root and independent source review checked all 83 packet pins, selected hunk
authority and five offline commands, including 12 inert controls, inverse,
authenticated-source applicability and syntax. Adopted controls and lint pass.
Independent review: `9c3609fda8ac100cac151271998f13f6ffadb64c820dfb848cd77cd52b83e7ef`.
Manifest: `3c6e341e94acea5f4a5977b7c85e6ae3e1cc5141757d3f9f700933b9db0787d7`.

The separate manual workflow retains the original 30-minute controller bound,
27-minute work/3-minute cleanup split and 14-minute build-command cap. It
changes no original runner, test selection, fault index, timeout or cleanup.
Original failures remain available. Actual paired execution is pending;
full-suite, runtime, ABI, CVE-candidate and package qualification remain open.


The standalone workflow file is present on remote main and passes actionlint,
but GitHub's workflow registry returned 404 and no matching manual run was
observed. Its registration cause remains unknown. A default-false
`upstream_experiment` boolean on the existing registered targeted diagnostic
workflow provides the reviewed alternative entry. Original 12 controls always
run; the option selects exactly one original or paired runner. New controls,
actionlint and the whole-workflow inverse pass. No existing default behavior,
permission, source guard or deadline changes. Independent entry review:
`2c9699dae1941308410c333571a98c84b2863775de7616035e70400a3bfdff20`.
