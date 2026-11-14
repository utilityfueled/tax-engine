# Private PostgreSQL gosu rebuild candidate

Contract: build unmodified upstream gosu1.20 with pinned supported Go1.27.4, using only admitted local source/SDK/module inputs and an explicit immutable already-local PostgreSQL base. Require Linux daemon architecture to match the target; this does not establish physical native-host provenance or qualify AMD64 through ARM emulation. No production/default Compose change, automatic release or vulnerability suppression is included.

The builder must reject altered, missing, symlinked or hardlinked inputs before touching the daemon. All copied build inputs must be verified again; build networking and pulls are disabled. Compiler and module metadata, normal privilege-drop smoke tests and exact executable custody are mandatory. Preserve symbols for scanning, source license and real commit provenance; do not forge upstream release signatures or VCS metadata. The root upstream has no Go unit tests: its `go test` result is compile admission, not functional qualification.

Use a finite monotonic execution budget with cleanup reserve and the existing owned-child supervisor. An uncertain child stops further daemon mutations and makes the receipt fail. Cleanup may remove only inspected operation-labelled resources; no global prune or shared VM operation. Candidate output deliberately remains local and unqualified. Archive save/independent load, raw scanning, real PostgreSQL recovery/rollback and genuine native architecture evidence remain separate requirements before any release.

Stage public inputs using the exact filenames and pinned URLs in sources.json; no network fetch occurs in this script. Both module archives must match frozen upstream go.sum; the official Go checksum lookup was independently cross-checked during source review. Use GOSUMDB=off only for this offline cache, retaining go.sum verification. No API credentials, app environment files or host account files belong in the context.

For a verified native ARM64 daemon, substitute its already-loaded immutable image ID:

```sh
node scripts/build-postgres-gosu-backport.mjs \
  --runtime podman --architecture arm64 \
  --base-image 'sha256:<verified-image-id>' \
  --source-cache /absolute/path/to/pinned-inputs \
  --output /absolute/path/to/new-private-output
```

The output directory must be new. The 45-minute total includes a five-minute cleanup reserve. Inspect `build-receipt.json` and every artifact/check status; a zero exit does not supply the separate runtime, archive or security evidence above.
