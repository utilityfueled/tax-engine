# Preserve independent archive failure diagnostics

The independent AMD64 archive verifier now retains the first 8,192 bytes of
stderr from its directly owned fresh-store Podman info command, with actual
exit status, truncation and capture-completion flags. The collector drains
excess bytes. Saved diagnostics redact local paths and long hexadecimal
identifiers. A failed info command or incomplete capture stops before loading
the archive. Successful warnings do not bypass metadata, immutable-image,
capacity or cleanup checks.

A separate fail-closed correction prevents an early successful shell status
from being marked verified before the verifier reaches its final verified
stage. The original five-minute CI step timeout remains unchanged. This adds
no standalone daemon cancellation guarantee, retry or relaxed readiness gate.

Spec-first regressions failed before implementation. Main adoption passes 964
tests in three suites, types, scoped lint and Bash syntax. Independent review
passes twelve offline cases, including collector and cleanup failures. Fake
owned commands test the failure boundaries without a daemon, VM or cloud call.
The first root run omitted the existing SHA256 tool from PATH and failed at
export with 127; the complete managed PATH passes unchanged source. Prerequisites
include Bash, jq and sha256sum; that setup failure remains retained separately.

Source freeze: `919756f2445672448a31c44a73b20d6ffa3228ea25a3c55bad2e1c7872e97b3c`.
Independent review: `0a8ca2eee2143f3a6d761fed5daeafd31496231c7d77f34c07dcbb95f4df347b`.
Root adoption: `0bc852bf76770109513768d1f893617b5ff8638647da52d753cc2d5d83e3f630`.

The [actual earlier remote exit 125](upgrade-2026-preview-remote-a32a3b10-20261115.md)
remains a failed archive check with unknown cause. These offline tests do not
replace a successful actual fresh-store import. Final-source CI/runtime evidence
and advisory disposition remain required.
