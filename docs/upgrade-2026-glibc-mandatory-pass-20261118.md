# Opt-in glibc six-case mandatory-PASS profile

This is a separate functional qualification contract, default off. It does not
reclassify failed run `44227921612`, waive XPASS, change upstream C assertions or
approve a runtime image. The original full paired suites, allocator/CVE
baseline-failure/candidate-pass reproduction, ABI, source, sandbox, resource,
deadline and cleanup gates remain required.

Only six named cases in the original baseline and candidate `amd64-libc` suite
lose their Debian environment failure allowances. Their original test bodies,
work counts and compiler flags stay unchanged; i386/x32 and other expectations
remain. The appended assignments are empty: GNU Make treats any nonempty value,
including `no`, as enabling expected failure. Exact authenticated authorities
and actual evaluator controls bind this change.

Each case must have exactly one summary PASS, original exit zero, complete
case-specific output and compiled-selection evidence. Known unsupported/setup
paths fail. The collector retains all twelve native executables and twelve
mapped objects, generated headers, exact command records and source bindings.
Dependency evidence may contain fixed final `.o.d`, temporary `.o.dt`, or both;
both present forms must agree after the exact authenticated Makerules rewrite.
Malformed present evidence cannot fall back to another file.

Collection retains the original shared six-second and 16-MiB limits. Replay
independently enforces the same per-type file caps. All held bytes are charged.
Missing, changed, aliased, oversized, unsupported or late evidence holds. These
are finite source/command/custody checks in an owned build tree; they do not
establish hostile-writer-resistant historical execution identity or formal proof.
Actual file spellings, sizes and budget fit remain native evidence requirements.

Independent source review passed after preserving three rejected private
proposals: nonempty expected-failure overrides, temporary-only dependency
assumptions, and broader replay file caps. Root adoption then caught an existing
runner-inverse metadata mismatch and two broken spec references. The original
inverse test and rejection assertions remain unchanged; metadata now reverses
the optional branch exactly, and references identify actual tests. Initial
failures remain retained.

Local checks pass: 108 profile Python controls, 54 retained exporter Python
controls, 51 Node tests, scoped lint, workflow actionlint, typecheck, 9,528 spec
lines and inventory consistency. All previous 1,076 inventory rows are identical;
one new operations-only unsupported row is added. The explicit profile also
runs its inert controls in the workflow before native work. Native qualification
is pending.

Private source manifest SHA256:
`8c6e60254dab41568e39b5ad1f4f3c1250339306aaa388453a529b6bb954dea6`.
Independent source-review manifest SHA256:
`ae3f9130dbeed3d1e4326e0d8afd53d8f8cc58acf2acab36b5a990700e77f339`.
Root checks SHA256:
`0a8d892e9c3d064902057eab7125daef48832705c25713ad8ec587c95bb3ba56`.
No candidate release, risk acceptance, filing or model promotion is enabled.

Independent adoption-derivative review also passes. It verifies the unchanged
original inverse test, all original inverse entries, the five exact additive
replacement fragments, the two corrected references, conditional preflight and
sole new unsupported inventory row. Supplement manifest SHA256:
`f4ea27f8f6d060eeb753c82c1446ba482f907a56f352931b43510a0e3984b894`.
