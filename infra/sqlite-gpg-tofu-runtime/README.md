# GPG TOFU consumer fixture

This source-only module has a separate default-off guarded CLI and workflow. No
native fixture has run and no qualified package handoff has been supplied. It
cannot build a candidate, clear
the existing package/full-suite/CVE/sanitizer/ABI gates, approve a release or prove
coverage of indirect SQLite consumers.

The exact immutable PostgreSQL AMD64 base contains GPG
`2.2.40-1.1+deb12u2`; direct-ELF discovery identified `usr/bin/gpg` as its sole
regular-ELF direct `libsqlite3.so.0` consumer. Source and provider hashes are
pinned in the module. This does not resolve indirect calls or filesystem links.

`admitQualifiedPair` requires externally reviewed hashes of an actual original
source-candidate run's result, status, package checks and exported artifact
binding, plus the candidate package and provider hashes. It checks source/run/
attempt identity, successful normal cleanup/no deadline, the original
`assertSqliteChecksPassed` and package artifact ledger/hash. Missing, failed or
substituted evidence holds execution. Its opaque token is not accepted from
JSON. There is intentionally no permissive default or live dispatch adapter.
The future adapter must obtain expected pins independently from the actual
reviewed GitHub artifact; caller-provided hashes alone are not a signature or
independent qualification.

The new fixture would run only one owned native AMD64 container using the
existing hosted/source/capacity/supervisor/normal-cleanup controller. Root is
readonly; network is none; UID/GID is 65534; all capabilities are dropped;
no-new-privileges is required. Two readonly binds contain only public helper
code and the hash-verified candidate provider. Bounded `/work` tmpfs stores all
fictional data. Its private subdirectories are 0700, files use umask077, and no
host home, keyring, agent socket, email service or keyserver is mounted.

One synthetic Ed25519 signing-only key signs two fixed messages. Each side gets
a fresh public-key-only verifier home. Original GPG verifies A, A again, B and a
fixed tampered A. Each verification is a separately supervised process. The
original GPG TOFU regression specifies persistent signature counts 1→1→2;
the tamper must fail and leave count2. The parser requires the exact fictional
signer in VALIDSIG/GOODSIG/TOFU_USER, numeric TOFU_STATS, documented TFS count/
policy records, and the actual SQLite database header. Unsupported, missing or
unknown evidence does not pass. Signature timestamps and raw DB bytes are not
normalized or compared across phases.

The immutable loader uses its supported `--library-path` option. Every actual
verifier PID is recorded by the fixed shell wrapper. Its own PID-suffixed
`LD_DEBUG_OUTPUT` file must contain exactly one SQLite calling-init record at
the selected baseline/candidate path; another PID, fallback, a second provider,
`--list` or version output cannot satisfy this proof. Exact GPG/loader/provider/
agent hashes are checked before and after. The provider extracted from the
hash-bound Debian package must retain ELF64 little-endian ET_DYN AMD64, the
SQLite SONAME and original two dynamic dependencies.

Only 56 fixed allowlisted evidence files may be copied before tmpfs teardown:
status/TFS, PID-bound loader records, public binary identities/version, a
fingerprint listing, normal-closure result and 16-byte DB-header projections.
No home, secret key, public key, signed message, signature, DB, arbitrary stderr
or socket is copied. Raw machine evidence remains nested in the controller's
private directory; inherited public command-log copying does not traverse it.
Public summary fields are fixed booleans/counts and hashes, with every release,
ABI and complete-runtime qualification flag false. The synthetic fingerprint
is hashed, never published verbatim.

All three owned agents are started with their explicit temporary homes so
normal shutdown can verify the same PIDs. `gpgconf --homedir <owned> --kill
gpg-agent` requests their normal termination; read-only `kill -0` checks wait
at most15seconds per agent. Unconfirmed agent/owned-child closure holds cleanup
and is reported; it never authorizes force removal or action on host agents.
The original fixture failure stage survives successful closure/export. Normal
container stop/removal uses the inherited ownership checks.

Limits:15-minute job,12-minute controller including3-minute cleanup reserve;
at most48 fixture Docker commands (inherited admission/capacity/normal cleanup
remain separately supervised),60seconds for key generation,20seconds per
ordinary command and60seconds total agent-closure command. There is no retry.
The source controller retains its original20GiB admission/2GiB reserve gates.
Work tmpfs is16MiB; data-only export is8MiB with per-file bounds. The Debian
reader permits16MiB package/32MiB decompressed data/128MiB LZMA memory, never
executes a package and writes only one fresh0444 public provider file.

Primary exact-version source:

- [GnuPG TOFU SQLite open and signature insert](https://sources.debian.org/src/gnupg2/2.2.40-1.1%2Bdeb12u2/g10/tofu.c/): lines950–952,3440–3451; status format2955–2966.
- [Verification registration](https://sources.debian.org/src/gnupg2/2.2.40-1.1%2Bdeb12u2/g10/trustdb.c/): lines1284–1288.
- [Original replay/count regression](https://sources.debian.org/src/gnupg2/2.2.40-1.1%2Bdeb12u2/tests/openpgp/tofu.scm/): lines185–201; `--with-tofu-info` is used in this official test.
- [Machine record definitions](https://sources.debian.org/src/gnupg2/2.2.40-1.1%2Bdeb12u2/doc/DETAILS/): TFS285–300; TOFU status800–866.
- [Key generation and TOFU options](https://sources.debian.org/src/gnupg2/2.2.40-1.1%2Bdeb12u2/doc/gpg.texi/): lines658–697,1705–1753.
- [Normal scoped agent shutdown](https://sources.debian.org/src/gnupg2/2.2.40-1.1%2Bdeb12u2/doc/tools.texi/): lines356–364; no-autostart1375; GETINFO pid1551.
- [glibc2.36 loader source](https://sourceware.org/git/?p=glibc.git;a=blob;f=elf/rtld.c;hb=refs/tags/glibc-2.36): library-path1437–1444, libs debug mask2456–2457, PID-suffixed debug output2714–2728; elf/dl-init.c48 prints calling-init. These exact files were extracted from the already authenticated glibc2.36 archive, whose SHA was rechecked. Actual loader behavior remains a native-run prerequisite.

The private source packet retains spec-first scaffold RED evidence and distinct
meaningful RED controls for original-failure-stage preservation, non-AMD64
provider refusal, Debian format refusal, malformed machine status and immutable
environment custody. Nine new
controls plus six unchanged discovery controls pass;33 adjacent inherited
controller/package tests pass. Scoped ESLint, shell/Python/JS syntax and private
spec-reference checks pass. These are source/inert checks, not native results.
Repository inventory/full browser audit and independent peer review remain
adoption tasks. No live adapter should be added before a qualified pair and
reviewed fixed handoff exist.


## Guarded public-layout adapter

`scripts/qualify-sqlite-gpg-tofu-amd64.mjs` adds a separate explicit consumer
contract. The manual `sqlite-gpg-tofu-amd64.yml` workflow defaults
`enable_runtime` to false. Exact public nonfork utilityfueled/tax-engine/main,
first attempt, matching reviewed source SHA and canonical true input/environment
are required before inherited Docker admission. Complete public source closure
is bound in `inputs.json`, including this workflow, original fixture and inherited
guarded broker/controller. Stable repository paths only; no `.local` import.

The API-only temporary token is removed from the environment in the constructor,
retained in memory only for the original broker's fixed read-only GitHub API
requests, and cleared in finally. Storage redirects never receive authorization.
Original source-candidate artifact metadata/digest/size/identity/closed attempt
are checked before bounded download. Original paired library+debug packages and
ledger are decoded by the unchanged ABI inspector. A diagnostic-only package
pair with `originalQualificationPassed:false` is refused. Genuine successful
original controller, package/full-suite/baseline reproduction/all five candidate
regressions/all five sanitizer regressions and normal cleanup remain prerequisites.
The candidate package and exact original fixed receipts alone are privately
reconstructed; display status JSON may differ in whitespace, so it is compared
semantically and the local receipt uses the exact ledger-bound original status
bytes. All hashes remain attributable to original archive members.

No runtime image, GPG, GLIBC, library baseline or other dependency is built or
upgraded. The original immutable base/GPG/library hashes and loader are required.
Only the verified candidate SQLite provider is mounted read-only. Existing
network-none/nonroot/read-only-root/no-capabilities fixtures, 48 fixture-command
ceiling, 12-minute controller with 3-minute cleanup reserve and 15-minute job are
unchanged. Public fixture code is readable; secret signing key and all homes,
messages, signatures, TOFU database and sockets remain container tmpfs. Only the
original fixed 56 machine-evidence leaves may be copied into runner-private
storage before normal stop. No whole home or tmpfs export occurs.

Public uploads contain **only** `publish/result.json` and `publish/hashes.json`,
a fixed allowlisted projection of source/artifact/receipt/provider hashes, exact
consumer counts/booleans, bounded check/cleanup counts and fixed failure-stage
category. Unknown stages remain `unclassified-stage`. Arbitrary status/loader
records, command/error text, key fingerprints, keys/homes/databases/messages,
paths and raw archive members are never uploaded. Hashes identify evidence;
they are not signatures or independent raw-runtime review. The controlled public
workflow/source provenance must also be reviewed. `consumerFixturePassed` covers
only immutable PostgreSQL AMD64 GPG2.2.40's fictional local TOFU behavior, not all
consumers/indirect ELF paths, generic ABI, runtime compatibility, release acceptance
or filing readiness. All broader approval flags remain false.

No qualified original pair exists at preparation time. There is no live run or
fixture result. After independent source review, source adoption and a real
passing original package pair, root may supply its exact immutable artifact
coordinates and explicitly enable one run. Failed admission stays a HOLD. No
rebuild, substituted package/runtime baseline, automatic retry or threshold change
is permitted.

Offline controls (no Docker/GPG calls):

```sh
node --test tests/scripts/sqlite-gpg-tofu-runtime.test.mjs tests/scripts/sqlite-gpg-tofu-public-layout.test.mjs tests/scripts/sqlite-exported-abi-artifact.test.mjs
python3 -I -B tests/scripts/sqlite-gpg-tofu-public-layout.test.py
```
