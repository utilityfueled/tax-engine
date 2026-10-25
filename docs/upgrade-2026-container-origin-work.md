# Container browser origin and persisted-state verification

On 2026-10-25, remote Web run `40195215822` at `f8c6222` passed its
native amd64 build, smoke and recovery steps, then failed four browser cases.
The two private calculation requests lacked the external mapped-port origin;
two restored-state tests used a one-shot visibility check before hydration.

The runtime CI command now supplies its exact public loopback origin. Compose
and the example environment agree on `http://127.0.0.1:3000`, and the first-run
instructions explain how to change it with the published port or proxy origin.
The endpoint's exact-origin guard is unchanged. Five new cases verify the
configured origin, wrong port, wrong hostname, foreign origin and missing
configuration. Payments and upload tests wait for their saved UI state. The
consent fixture also waits for the newly created workspace before modifying it;
the initial local run reproduced that earlier creation race.

Verification:

- 42 security and Compose unit checks pass, independently rerun by the reviewing
  agent. Root/web types and scoped ESLint pass. No deadline, privacy assertion,
  persisted-value assertion or security control was relaxed.
- ARM64 image `7ec82595f3b8ce40b2328af8e6f7ab23a8aa347d3902de737ae97e04c0f97467`
  was built from tree `95e4e3afbae4e83d346e625056f9b7d675ed0ddb`, based on
  `c9e057c`, and run with a read-only root, no capabilities, no-new-privileges
  and loopback port3122. This is scoped package evidence, not final integrated
  artifact or staging evidence.
- All42 tests in the consent, payments and upload browser files pass against
  that image with retries0 and the existing CI30-second deadline. The test
  driver adds the five-line consent creation wait to the archived source;
  its file SHA-256 is
  `9cd324414330bf43383cb5db80826ab0615ef4e33c0dc36ad72e0d8f319af21f`.
  Required sample PDFs came from the local fetched registry fixtures.
- Browser log SHA-256:
  `520f8e31eb9ca35308b3e0dfdd006bd6e3f7d9d8711ef369f6168be6344cfdef`.
  Successful build log SHA-256:
  `39f127098f9c6a3782b9619882212dfafc4e012464e9db46f66ef1773c303c1a`.
  Logs are in `.local/upgrade-evidence/container-origin-*`.

The first local build exhausted disposable build-cache space; only verified
unused task image layers were removed before the successful rebuild. An initial
browser attempt also lacked the snapshot's sample-PDF prerequisite and failed
before uploads. Neither failed attempt is counted as passing evidence.

The runtime logs exposed a separate image-optimizer cache write under the
read-only application root. A bounded writable cache and matching smoke proof
remain a separate hosting follow-up. Full integrated browsers, both final
architecture images, advisory acceptance and external staging still remain.
