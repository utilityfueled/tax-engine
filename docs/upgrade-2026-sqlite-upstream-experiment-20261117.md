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
Original failures remain available. At preparation, paired execution was pending;
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


Actual paired run `44184632007` at `b9fe12dc` completed successfully. The
original join script retains one failure among 107 tests; the original and
instrumented OOM logs are byte-identical and retain one failure among 8,162
tests at allocation 2330. The separately patched whole scripts pass all 107
and 8,162 tests with all allocations freed. The original OOM script and fault
count are unchanged. The paired DBPAGE core recovery still changes exit 1 to 0;
that flag is separate from the two official upstream corrections.

All 83 controller checks exit zero, with no deadline or cleanup errors.
Independent artifact review verified 55 original-ledger files, 56 exports and
the three exact reviewed source hunks; assessment SHA-256:
`a030d6d7b9c714f1473835dbdccd7c5265992d63ecac41d148288750493697a5`.
Root verified all 17 assessment pins and the retained original failures. The
archive is 41,307,502 bytes, SHA-256
`4dfed841f7a4ecee4480045f6390502307787e9a1c656aed3ae392971ba93095`.
This is targeted diagnostic evidence. Full original SQLite qualification,
package/runtime integration, ABI, all consumers and release gates remain open.
The precise historical allocation cause remains unproven.


The next full-package path now applies those same three pinned prerequisites
to the authenticated common source before creating the vulnerable-CVE baseline
and fixed candidate. Both variants are explicitly compatibility-repaired. The
existing fulltest/alltest/fuzztest, all five original CVE cases with a normal
baseline exit 1 naming at least one distinct-10.1–10.5 failure, all five
candidate passes, all five sanitizer passes, nonroot execution, signed inputs,
compiler flags, deadlines and normal cleanup remain unchanged. DBPAGE is not
added to this package. Root and independent review verify 39 source/evidence
pins, the whole original recipe inverse and 26 passing relevant controls;
independent review SHA-256:
`fd59ccf6662fd19aeba9f49fe259003c87b830e13997567548e4229944825af3`.
The actual full-package attempt below remains unqualified; ABI and runtime
integration remain pending.


The full-package attempt [44190069976](https://github.com/utilityfueled/tax-engine/actions/runs/44190069976)
at `17cf0189d078b88c54047249e08568ab68a56592` failed. The
compatibility-repaired baseline Debian package build exited 0, but its complete
upstream fulltest exited 2 at `recover.test:78`, `do_recover_test1.1.2`, when
closing the recovery CLI pipe reported an SQL logic error. The recipe exited 1.
Candidate packaging, paired CVE regressions and sanitizer gates were not reached.
This does not prove a DBPAGE cause or qualify the baseline's full suite.

Independent artifact review verifies the exact nine reviewed source bindings,
the three common prerequisites, 36 ledger files, 37 export bindings and all 88
zero-exit controller checks. Normal cleanup has no errors and the deadline was
not exceeded. Assessment SHA-256:
`e48c4c22d86c30e5c7b45920298add58fe035c19b54823e1f5cbad936ed90344`.
The 62,375,818-byte archive has SHA-256
`50e80b6a995a8877b808a34f99cc75f5becd429c83aa30b1dc7c9af2ca70587c`.
Earlier original failures remain retained. Full package, CVE, sanitizer, ABI,
consumer and runtime qualification remain open; no risk acceptance follows.
