# glibc IFUNC conditional experiment

The opt-in XFD experiment now adds a four-condition correction derived from
authenticated Debian 2.44-1 source to pinned Debian 2.36-9+deb12u14. Only explicit
`with-lld=no` clears the four IFUNC expected-failure annotations. All original
test bodies, assertions, registrations, static variants and tunables remain.
This is a local adaptation, without a correcting-upstream-commit claim.

The signed Release → source index → source archives → patched Makefile chain
is pinned in `infra/postgres-glibc-ifunc-experiment/PROVENANCE.json`. The original
authenticated baseline recipe, manifest and preparation receipt remain intact.
The original XFD stage runs first, followed by this additive stage equally for
baseline and candidate. Exact inverses retain the original runner and workflow.

An EXIT hook retains per-flavour `config.make`, `configparms` and `config.log`,
including after ordinary build failure. A restricted parser records literal
assignments and overrides. Unsupported Make syntax is unavailable; no Make
expression is evaluated. The sole admitted include requires the exact variant
path and authenticated original Debian annotation bytes. Canonical linker ELF
hash and bounded `--version` describe export time, without proving historical
linker execution. A successful package also needs both variants, exact suite
coverage and exported hashes. Export failure holds an otherwise successful run.

Review caught and retained two failed proposals: prefixed assignments were
silently ignored, then tight `LD+=...` and CRLF continuations bypassed rejection.
The final successor rejects those forms and the finite operator/spacing matrix.
Root verified 184 pins and ran 35 Node and 36 Python controls, all passing. The
40 inert source/evaluator checks retain 16 RED failures before the IFUNC change
and 40 passes after it. These checks execute no native glibc package. Root also
adds explicit Node imports required by lint and the generated inventory row;
that row claims no tax engine, form or filing support.

Six other annotations remain strict holds: `tst-create-detached`, `tst-robust8`,
`tst-cpuclock2`, `tst-cputimer1`, `tst-timer` and `tst-support_descriptors`.
No profile-specific cause or valid correction has been established for them.
The original FAIL/XPASS/UNRESOLVED/ERROR gate, full suites, allocator regression,
ABI, consumers, sandbox, resource and deadline requirements remain unchanged.
All 15 adopted source paths are outside the current 37-member GPG authority.
No native package, runtime or release qualification is claimed.

Private final source manifest:
`nov18-glibc-ifunc-export-operator-successor/MANIFEST.json`, SHA256
`a05cfd93f67987e51babb671a1c9708fa8b2d72d421b289f9d34644e9bc42b72`.
Independent source review:
`nov18-glibc-ifunc-operator-independent-review/MANIFEST.json`, SHA256
`87da000c1da1881969777ef7863dc7b4e05ce9d4163ef3dd66e9089e0f884529`.
Root checks: `nov18-glibc-ifunc-operator-root-adoption/`.

The follow-up collector retains only the six fixed cases' existing `.out` and
`.test-result` files, with one MiB and 64 KiB per-file limits and a 16 MiB aggregate
reserved-byte ceiling. It records absent, oversized, changed and partial outputs
explicitly, without inferring test execution. Capture follows all original linker
observations, leaving their six-second budget unchanged. The original recipe,
runner, workflow, strict gate and resources remain unchanged. Root verified 185
pins; 35 Node/50 Python, spec, inventory and lint checks pass. Inventory stays
unchanged. No native qualification follows from these controls.

Follow-up source manifest:
`nov18-glibc-six-diagnostic-export-preparation/MANIFEST.json`, SHA256
`02ece4694fa31d8d155aa6c3edf5d912dc8bf009c9581979b098d4ef755d9783`.
Independent follow-up review:
`nov18-glibc-six-diagnostic-export-independent-review/MANIFEST.json`, SHA256
`2fe8809447ab1b4022d16f4b335e4da210ba098ee04383fed3c3fa6860dbe101`.
The next exact-source opt-in attempt may now retain the previously missing
configuration and six-case outputs. No retry, altered test or relaxed status is
introduced; six XPASS would still fail the original strict gate.
