# Immutable container identity chain

The a5e remote strict run retained 643 browser passes, seven timeouts and five
original skips. Its archive and SBOM checks exposed a concrete identity-level
mismatch: Docker reported an OCI index digest while Syft and imported Podman
identified the selected image configuration. Equal layer lists alone did not
establish the missing archive chain; historical qualification remains failed.

The correction verifies raw exported target, unique native AMD64 manifest,
config and selected layer hashes/sizes before import. Podman must match that
verified config and all nine original signature fields. The actual SBOM gate
independently rehashes the retained target/manifest and Syft config, keeping
the original immutable target as userInput and CycloneDX identity. Missing,
ambiguous, corrupt or untyped platform descriptors fail. Only explicitly
related attestation manifests may use unknown/unknown platform. Existing
sanitized diagnostics, cleanup, scan policy and browser deadlines remain.

Spec-first failing cases are retained. Root and independent whole-source
reviews pass; each ran all 56 focused controls across three files without a
daemon. Root terminal:19730/0/c591c8; independent:92115/0/b01359. The root's
first command selected only two existing files (42 passes); that is retained
and does not substitute for the later complete run.

Final source addendum: `116ed7311e2dbb1232f113f30e7eae2f57af995e263ae4688c7cee90d2022a46`.
Independent review: `05fdcb69de88424e5863299dbbba912f4a4f89950bbb126cce8f2d86aaa8df3e`.

A fresh native runtime run must establish the corrected archive/SBOM chain.
This change does not waive scan findings or qualify public release.
