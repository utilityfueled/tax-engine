# Independent archive verifier short-root correction

The retained [actual 8ab7 workflow](https://github.com/utilityfueled/tax-engine/actions/runs/43673352381)
now explains the repeated native import failure. Podman info exited 125 before
load: “the specified runroot is longer than 50 characters”. Diagnostic capture
was complete and untruncated; the archive was 426,039,296 bytes and the owned
scratch directory was removed. This establishes a verifier path-length defect,
not image corruption or a successful import.

The verifier now creates one exclusive short directory under canonical `/tmp`,
checks its generated basename, current owner, mode 0700 and filesystem identity,
and enforces the complete runroot length before export. Archive, graph storage,
runroot and loader temporary data remain inside that one directory. Cleanup
refuses a symlink or changed device/inode/owner/mode identity. Native platform,
capacity, immutable image/source/config, empty-store, bounded diagnostics,
import and final cleanup gates remain intact. The workflow timeout is unchanged.

The spec was updated first. Four new controls failed against the old script
with ten existing controls passing. The corrected candidate passes 968 tests
across three suites, types, scoped lint, Bash syntax and spec validation. Main
adoption passes the same 968 tests in two invocations and the inventory check.
A separate reviewer passes twenty controls, including a matching-shaped symlink,
wrong owner, mode 0755, stat failure, diagnostic collector failure and cleanup
failure. The entire inspection/import suffix remains byte-identical. These are
offline controls; actual AMD64 import qualification still requires the next run.

Private evidence: `nov15-container-archive-short-root`; author freeze
`6c804d329dfc36e3fece7df6daed73bdfd9a2b6d0ddaaee0b7bdf5421fce875e`;
separate review `4bdce92ac209fa27352e697d53c21a184f67d345615144e7fd8a0f551700ce0f`.
The three changed source paths are outside the browser source closure; all 641
case policies and 1,967 application/test closure hashes remain unchanged.
Exact-source aggregate and real hosted/native qualification follow; prepared
6ebc rehearsals were held and never launched. No production release, image
publication, advisory acceptance or filing/model promotion is implied.
