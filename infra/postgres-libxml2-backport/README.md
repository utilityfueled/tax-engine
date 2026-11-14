# Optional PostgreSQL libxml2 candidate

This recipe builds a private experimental image. The default Compose image is
unchanged. The candidate is not release qualified or risk accepted: the recorded
scan still has nine Critical matches, and public libxml2 structure sizes differ.
See the [qualification ledger](../../docs/upgrade-2026-postgres-libxml2-native-20261114.md)
for actual tests, retained failures and outstanding decisions.

Use a dedicated local Linux container daemon on the selected native architecture.
The script checks the daemon's reported architecture; independently establish
the physical host and virtualization provenance. An ARM64 host running AMD64
emulation does not establish native AMD64 qualification. This script does not
create, start or stop a VM.

Download the four public inputs listed in `sources.json` into a dedicated cache,
using each entry's exact `name`, `url`, byte length and SHA-256. The builder rejects
missing, aliased or mismatched files before contacting the daemon. Source and
recipe inputs are pinned. Toolchain package installation uses Debian repositories
and records its package inventory; bitwise reproducibility is not established.

For example, with a previously verified ARM64 daemon selected:

```sh
node scripts/build-postgres-libxml2-backport.mjs \
  --runtime podman \
  --architecture arm64 \
  --source-cache /absolute/path/to/pinned-source-cache \
  --output /absolute/path/to/new-private-output \
  --time-limit-minutes 120
```

Choose `docker` or `podman` explicitly. The output directory must not already
exist. The default time limit is 150 minutes, including a 15-minute cleanup
reserve; a surrounding supervisor must allow the selected limit plus its own
cleanup time. A shorter limit must still permit the full required checks.

Inspect `build-receipt.json`, every required package/sanitizer status and the
artifact manifest. A successful run leaves its labeled candidate image and
private evidence directory for subsequent independent archive admission, runtime
consumer tests, recovery/rollback tests and scanning. It removes its labeled
intermediate images and export container. It does not publish images, edit
Compose, suppress findings or approve ABI compatibility.

If a timed-out child has not confirmed exit, the receipt records that uncertainty
and stops further daemon actions. Resolve that owned child and inspect remaining
labeled resources before another rehearsal. Preserve failed receipts. Release
qualification still requires both native platforms, actual runtime evidence and
the outstanding independent security and maintenance decisions.
