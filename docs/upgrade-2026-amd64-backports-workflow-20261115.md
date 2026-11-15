# Native AMD64 PostgreSQL backport qualification

This adds a manual-only qualification path for the existing libxml2 and gosu
candidate recipes. It does not change the default PostgreSQL image, ordinary CI,
security acceptance or release gates. Actual AMD64 qualification is pending.

Three fresh standard public GitHub-hosted Ubuntu 24.04 jobs build packages,
exercise the candidate runtime, then independently import and scan its immutable
archive. Full commit/run/attempt identities, archive lengths and hashes, native
ELF/Go metadata, source manifests, image configuration, provider hashes and notices
bind the handoffs. Only the fixed public evidence allowlist is uploaded; runtime
logs, database credentials, dumps and build contexts remain excluded.

The job ceilings total 270 minutes, including cleanup and uploads. Actual free
workspace and Docker capacity must satisfy 20/12/8 GiB admission floors, including
2 GiB reserves. Fit on the standard runner is unproved: inadequate capacity stops
execution without deleting unrelated data or selecting a paid runner. There is no
emulation, retry, registry publication or automatic candidate promotion.

Runtime checks cover named/numeric identity and groups, HOME, PID 1 and normal
TERM, SCRAM, exact NUMERIC(38,8), XML/bytea, restart, dump/restore and stopped-volume
rollback. Cleanup requires exact ownership, stopped state, explicit non-OOM and
an ordinary integer exit status. A terminated or unconfirmed child blocks every
later command. No force-removal of running containers is permitted.

The independent scan uses a fresh official database and checksum-pinned tools.
Its effective configuration must have no ignore rules, include upstream kernel
headers and retain matcher suppressions. Full raw JSON, including ignoredMatches,
is preserved and counted separately. Successful scanning never accepts a finding.

Validation before the first dispatch:

- Author: 70 tests pass and one real-database test is skipped across the related
  infrastructure packages; 13 spec references pass; ESLint, actionlint and the
  recovery package's strict TypeScript check pass.
- Root: 16 tests pass and one real-database test is skipped in the two focused
  AMD64/recovery files. The AMD64 file contributes 14 passing controls.
- Independent source review passes, including actual benign SIGHUP and
  mid-cleanup uncertainty controls. It establishes source behavior, not a native
  runner result.

Private retained evidence: implementation manifest
`b488412656441c9e4efa6467a000076623814e1fb3e0e6c8d2107839b4d45fd1`;
independent review
`cf921d95eeb3279886b4ff5460eece8d59653cdbb551690c0bf24289c599f645`.
Earlier failed controls and review corrections are retained. No claim of generic
ABI compatibility, bitwise reproducibility, physical-host provenance or advisory
remediation follows from this preparation.

The first actual manual run, [43695617103](https://github.com/utilityfueled/tax-engine/actions/runs/43695617103),
uses `dbb190ff`. Package construction and every runtime workload pass, including
normal container/volume cleanup. Final image cleanup fails: candidate removal
returns zero, then inspection of the imported base returns one. The independent
import/scan job is skipped. This is a failed qualification run.

Docker normally removes untagged ancestors when removing an image. The observed
sequence supports that explanation, but the public artifact excludes the raw
cleanup error, so the exact cause is unproven. The correction adds `--no-prune`
to both explicit, ownership-checked image removals. Missing images, wrong identity,
foreign labels, daemon errors, conflicts and operation uncertainty still fail.
Foreign ancestors are preserved. See [Docker's removal option](https://docs.docker.com/reference/cli/docker/image/rm/)
and the [versioned CLI implementation](https://github.com/docker/cli/blob/v28.0.4/cli/command/image/remove.go).

The spec-first regression reproduces implicit parent removal before the fix.
Author and independent related checks pass 63 tests; root's focused AMD64 suite
passes 15 tests. Eight additional independent lifecycle controls and all 12 spec
references pass. No new actual runner qualification is claimed. Retained source
manifest: `721bd6f99dd4d1048ddc16c55e455fd2179a34cd99a9132492a090c56722be9f`;
independent review: `7b3c377055cdef14bbe2c8ede9a1a724c9335ba63d33e666fdf868a541a837bd`.
The failed runtime artifact is retained with verified digest
`c36aeef7b3141b9b0ea35da58718f7ae64ee9f66645727f4101daa9fe788bef9`.

The second actual run,
[43699867290](https://github.com/utilityfueled/tax-engine/actions/runs/43699867290),
uses `21dfc258`. Package construction and runtime workloads pass. The imported
base now survives candidate removal and its identity/ownership inspection passes,
but explicit base removal exits one. Independent import/scan remains skipped.
The retained runtime archive matches GitHub's digest
`32fe8dab70c8df04f95f2a4fe9cf3f60b4226768c8e2f900cc0179dbaa5afc57`.

The candidate's immutable configuration records an intermediate image reference.
[Docker's versioned deletion implementation](https://github.com/moby/moby/blob/v28.0.4/daemon/images/image_delete.go)
rejects images with dependent child images. This supports a distinct legacy
intermediate-image conflict after `--no-prune`; private daemon stderr and the
complete actual parent chain are unavailable, so the exact conflict is unproved.

The source-first successor records all image IDs after the admitted base import
and immediately before the gosu build. Cleanup admits a chain of at most 64 exact
new parent nodes terminating at that base. Intermediate images must be Linux
AMD64, untagged, without digest/container references, and have no foreign operation
label. Their exact ancestry supplies custody when the final CLI label is absent.
Metadata and container references are checked again before child-first explicit
`--no-prune` removal. Preexisting, cyclic, missing, referenced, changed or uncertain
nodes stop cleanup. Base ancestors remain untouched; force, blanket pruning and
missing-image exceptions remain prohibited. Builders, recipes, time limits,
publication allowlist and normal container-closure gates remain unchanged.

Root's actual predecessor run fails two controls and passes fourteen. The
correction passes all 64 related tests, including 29 ancestry/admission scenarios,
plus engine types, spec references, inventory and focused lint. Independent
review repeats 64 tests and adds ten adversarial controls. This is source/model
evidence; a successful native correction run is still required. Retained source
manifest:
`a8d253c309c1fb30d88f1c8bc46c98e7782bf3d860fa59539a4efbb5d863f5ed`;
independent review:
`33253a8df2c3f9242f65d86b75756ac2826a1b8b9d67e796068f3fa1e56d5c3a`.


The third actual run,
[43704599960](https://github.com/utilityfueled/tax-engine/actions/runs/43704599960),
uses exact `aa4df8c226713480117350c32fe8c1a14fcdbbd1`. All three jobs succeed.
Package construction records fourteen controller checks and 23 builder checks;
runtime records 145 controller checks and sixteen gosu-builder checks; the
independent fresh-store import/scan records 37 checks. Every recorded command
exits zero, cleanup-error lists are empty and no deadline is exceeded. The final
explicit imported-base removal now succeeds after the admitted intermediate
chain is removed. The two prior failed runs remain failed evidence.

The final runtime image is
`1b452ca1bc1d61f34352d06d9f617d45ac9f5eb4519163795629f28a6cb17320`;
its archived bytes have SHA-256
`f943929bcb8ba7f383417576bc11d62174daf0d5b3899946ac4810ac030e8a61`.
All three downloaded outer artifacts match GitHub's size and digest. Independent
saved-artifact review binds exact source/tree/recipes, inner archives, image
configuration and labels, selected handoff files, SBOM and the raw scan. Root
separately verifies all outer digests, recorded command statuses, cleanup and
raw severity counts.

The scan completes with 509 visible matches, including six Critical and 110 High,
and retains one additional ignored Critical in the raw `ignoredMatches` output.
That ignored finding remains disclosed and unaccepted. Package `abidiff` exits
four; no generic ABI approval follows. Functional and cleanup success does not
establish security acceptance, arbitrary compatibility, reproducibility, final
application qualification or permission to publish/promote this candidate.

| Retained actual evidence | SHA-256 |
| --- | --- |
| Package artifact | `85bd45a6ff086c65d96404803da484534867b3ac2e87fd3c67c0ed0deb02858c` |
| Runtime artifact | `7ef4491fcc52f8cddb8b1a3b61c5502ab348c18d485dfcbd3a78da773d02fd30` |
| Independent artifact | `b0a251849552d1d51b6a7188d9ee765a5955691d039c27dba00b80597f4bec55` |
| Independent actual review | `91b006825cadb4c5d7a81ede73d503e4c541800915824d2bdfb0f2c99e5a00ea` |
| Root actual review | `7f018c6d698035abeff2e62977888993b27a8cd40ef84defa9dbdbef3cb5d4e6` |
