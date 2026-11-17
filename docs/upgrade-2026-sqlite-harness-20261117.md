# SQLite upstream harness correction

The first native AMD64 run, [44035000141](https://github.com/utilityfueled/tax-engine/actions/runs/44035000141),
built the baseline package but failed linking its full-test Tcl harness with a
duplicate sqlite3Fts3InitTerm symbol. No SQL regression or sanitizer pass is
claimed. The failed result and full linker log remain retained.

The correction explicitly selects upstream USE_AMALGAMATION=1 in only three
later harness commands. Debian package builds and configured features remain
unchanged. The authenticated upstream Makefile plan retains all 13 test flags,
alltest and fuzztest, while removing the duplicate fts3_term implementation.
The paired five cases, positive baseline requirement and ASan/UBSan remain.

Spec-first RED is retained. Root and independent source reviews pass; both ran
16 focused controls. The independent full-source make replay confirms 141→88
source inputs and two→one fts3_term entries. Whole recipe inversion confirms
only the three harness overrides. Compilation and all native tests still need
a fresh actual run; no risk, runtime or release qualification is implied.

Source manifest: `c22d823556508a49e625ef81f4a5528fec1e94c48a26533963c17045dfb298ce`.
Independent review: `ff7395cdbdb76154d799d392eb7c89140d2e9b936cc437b9d45650562b05d18f`.
Root focused terminal: `3424e9/0`; independent `7af87a/0`, source replay `dd3d68/0`.
