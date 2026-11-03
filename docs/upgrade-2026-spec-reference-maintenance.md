# Spec reference maintenance, November 2

This package repairs metadata discovery in the existing unchanged CI validator.
It changes 22 YAML documents and one parameterized PDF test declaration.
The three residency tuples, the full callback, both rejection cases, formulas,
monetary assertions and validator are preserved. No tax method or readiness gate changes.

The original privately reproduced failures were 7/601, then 2/606 and 1/607.
The independently reviewed original 22-file candidate passes 608 references.
Current main adds the newer employee composition spec: two genuine 610-pass,
one-failure runs exposed unquoted metadata and two missing literal `%s` suffixes.
Those links now point to the actual unchanged parameterized test declaration.

Main verification: 611/611 reference checks, the same five PDF controls,
6,984/6,984 full spec lines, inventory check, strict zero-warning lint and diff
check pass. Independent main-artifact review approves all three saved PDFs/six pages:
928 saved objects per file resolve, all 145 fields/119 widgets and text match,
private identifiers are absent, and all six rendered pages match the approved
copies. Serialization hashes differ; byte equality is not claimed.
Main artifact receipt `e1f9c5ba42c1134cfb64215134582b9418e6688204335d81ed0b0ab25372645a`;
new employee metadata extension `e46a9f02f67e2acbad80b9abc22f525da92a8300771052db8f3a0f7a3ed1987c`.

Private evidence: `nov02-parent-spec-metadata-main*`; original manifest
`7ac75bccd52e1bb30ed51a4ec84c7338743ee4b88708ec5bd61209bd2fdc3eff`;
independent original review
`36c0bf23af2fbeed13f8886ecbf99ca23559d92d5e497ac3b242005a0b4e4040`.
Only explicitly owned paths were copied. The complete private archive includes
six equivalent directory symlinks with normalized trailing slashes; they were
excluded. Exact unowned regular-file proof covers 4,355 files. Immutable errata
`af59037f513e72c33c72d953a79520573d7a15818d58f070c1aeac04b7073fbe`.

Global coverage, current browser suite, human interpretation review, final forms
and hosted/self-host release qualification remain separate outstanding gates.
