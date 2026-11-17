# Standalone SQLite native runner — November 17, 2026

The manual AMD64 workflow executes the reviewed SQLite source candidate without
changing a shared runtime image or deployment. It admits only the exact public
default-branch commit on the first native GitHub-hosted attempt, uses a local
Unix Docker daemon, reserves capacity and cleanup time, and rejects source drift.
Package builds have network disabled. No image is published.

The original Debian keyring is reproduced from the exact official `.deb` and
its unique regular member. All source verifiers use the owned controller,
sanitized environment, deadlines and unknown-child hold. The runner exports
actual hash-bound package/test artifacts, requires every original paired
regression/sanitizer result, and normally removes only its newly created
operation-labelled resources. An artifact carrier or uploaded log cannot
substitute for a passing result.

The spec-first failure precedes implementation. Final author and independent
checks passed 15 focused tests; root passed 19 checks across all three new source
packages. Exact keyring extraction was independently replayed. Whole-source
review binds all 19 runner/dependency pins:

- Author manifest: `21a01b15098f1e40d109f00fceaeedaa9399240577018df528d1c164cd19c34d`.
- Independent review: `bcec59abb9f50cb64bbdc7f94e35729024f36acb45f98cf6b3c550a9f99df934`.
- Root adoption: `dd5fb33d61685f93ca93b33b9b6ffb617fc4f054957b674bbe5a3f958d569b0a`.

The initial source-review finding about an uncontrolled duplicate verifier is
fixed and retained in the review history. Actual workflow execution remains
pending. glibc is explicitly rejected by this runner until a separately reviewed
execution path exists. Runtime/ABI/consumer/scan qualification and human risk
acceptance remain separate gates. Artifacts have three-day retention; public
repository artifacts are not confidential storage.
