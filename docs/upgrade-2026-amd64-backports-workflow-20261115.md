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
