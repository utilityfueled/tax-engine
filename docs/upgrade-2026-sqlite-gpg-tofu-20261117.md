# GPG SQLite-backed runtime fixture

The inert discovery identified `/usr/bin/gpg` as the immutable image's sole
regular ELF direct SQLite consumer. This manual-only fixture uses that exact
GPG and original provider, replacing only the candidate SQLite library for
the candidate verifier. It requires a real corresponding pair that passed
the original package, full-suite, CVE, sanitizer and normal-cleanup gates.
Missing or failed qualification holds before fixture execution.

A fictional signer and fresh verification homes exercise repeat signature A,
signature B and a tampered negative. Both branches must retain TOFU signature
counts 1→1→2→2 and the fixed validation statuses. PID-bound loader evidence
must show the actual verifier loading the exact original/candidate provider.
Separate version or loader-list commands do not replace that proof.

The default-false enable flag, exact main/source/attempt guards and 37-file
closure are checked before inherited daemon admission. Job/controller/cleanup
limits remain 15/12/3 minutes, with at most 48 fixed commands. Owned tmpfs homes,
keys, messages, databases and sockets are never exported. Only fixed safe
metadata/count/hash files are public; closure and normal cleanup remain gated.

Author manifest:
`c44cae01895cb38da699e6acb2759f41a5dda5804af5dc878b4bb5940092d85f`.
Independent source review:
`fb4f38799af2a1acfb0326614e38af11a4e33d7ce58b92ee45aef78557df2a35`.
Root verified all 56 frozen pins, 15 current dependency origins and 14 exact
adoptions. Twenty-one Node controls, three Python synthetic archive/CLI controls,
28 current closure pins, scoped lint, actionlint, shell syntax, spec, inventory
and browser audit passed. No qualified pair or actual runtime run is claimed.
Any later ABI decoder/broker change must rebind and review the source closure.
[Source contract](../spec/ops/sqlite-gpg-tofu-public-layout.yaml),
[fixture details](../infra/sqlite-gpg-tofu-runtime/README.md).

The original-distribution ABI extension was followed by an explicit closure
rebind: exact old28 union ABI13 equals37 paths, with23 old pins unchanged.
The complete GPG CLI differs only in the source-list declaration. Independent
review `2b90a7ab08b5646215e95fef8338cc2d5e03ac1b437282dd9bbd6adcc5db4c68`
verified all49 rebind pins, all15 adopted ABI/rebind paths and the actual37-file
closure. Runtime actions, acceptance gates and limits are unchanged. No actual
run is claimed.
