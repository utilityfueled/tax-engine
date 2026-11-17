# NEW212 strict-container timing replay

Preparation only: a separate default-off manual workflow replays the two
existing NEW212 cases with the existing fixed-schema timing probe. No current
Linux replay result, performance improvement or qualification is claimed.

## Preserved predecessor evidence

Exact source `933b1a85a43f09e16245a31230b210f63160bae8`: Web run
`44159693087` and CI run `44159692992` were canceled when the newer source was
pushed. Completed browser batch summaries establish **434 strict-container
passes** and **459 ordinary passes**, with the five original skips in each.
These are incomplete runs, not complete-suite totals. Unit and coverage jobs
were canceled without final totals; build, lint, types and spec jobs passed.

The strict run had a genuine NEW212 desktop failure **before cancellation**:
the original 30,000 ms case deadline, reported at the filing-purpose POST on
`oh-business-part-year-native.spec.ts:160:834`. Its retained trace shows the
review response and download waits completing around trace time 31,633 ms,
then response body completion at 31,682.277 ms. The next fixed assertion starts
at 35,311.910 ms: a **3,629.633 ms unobserved host interval**. These trace-clock
values are not case durations. No filing-request before-event exists and the
trace network files are empty. The failure label alone does not establish a
slow filing endpoint, network cause, Python CPU cause or any other root cause.
There are no opt-in timing records in that predecessor artifact.

The runtime artifact `14365910563`, canceled logs, selected NEW212 trace and
bounded timing projection are saved in
`.local/upgrade-evidence/nov17-ba02-default-workflow-observation/`.
`predecessor-observation.json` SHA-256:
`5e53000d61e1f6e13f0aa4839fea6341100ccfd5dcf4be5d49d45c8b488aaeee`.

## Concrete replay and invariants

The new workflow `.github/workflows/new212-container-timing-amd64.yml` has only
`workflow_dispatch`, requires an exact full public default-branch source and
an explicitly enabled boolean whose default is false, and uses its own run-ID
concurrency group with cancellation disabled. It preserves the original
Dockerfile and strict runtime settings: native AMD64, source/image proof,
read-only filesystem, all capabilities dropped, no-new-privileges, the same
64 MiB temporary/cache mounts and loopback origin. Pinned read-only actions,
a 35-minute job and an 8-minute browser step bound execution. Normal owned
stop/removal and three-day evidence retention are explicit.

The new helper preflights exactly the existing desktop and mobile case keys,
their expected status and 30-second deadlines before calling the unchanged
source- and request-budget-admitted browser runner. The configured worker
limit remains two; same-file Playwright execution may use one actual worker.
Retries remain zero. The selected PDF interpreter and pypdf 6.10.0 prerequisite
are retained. The helper forwards only the existing exact-value timing opt-in
through the shared environment reducer. All browser actions, tax/PDF/privacy
assertions, child arguments, deadlines and natural-window budgets are unchanged.

The existing ten-phase probe separates response/download waits from file,
Python-call, parsing and validation intervals. The new projection admits only
its fixed fields and records actual per-case outcomes. Missing finishes remain
incomplete. Wall intervals include callback construction and waiting; they do
not measure server or child CPU. A dedicated successful replay would still
leave the original failure and full strict-container qualification unresolved.
No shared Web workflow, browser test, product source or request-budget file was
edited for this package.

## Checks and remaining work

- Spec first, then five genuine missing-implementation failures retained in
  `nov17-new212-container-timing-preparation/RED.log`.
- A separate prerequisite regression failed because the first helper omitted
  the selected PDF interpreter; the corrected helper retains the original
  interpreter choice and pypdf check. Failure evidence is retained.
- **5 new controls pass**, including source/opt-in negatives, exact two-case
  selection, malformed timing records, actual forwarding and unchanged runtime
  limits. **161 adjacent controls pass** in five files.
- The projection also reads the previously verified macOS instrumented report
  and recovers both actual cases and all **40 fixed records**; this exercises
  real reporter output without claiming a new runtime run.
- Scoped lint, JavaScript syntax, workflow YAML parse, and all **9,442 spec
  references** pass. The generated coverage inventory needs regeneration for
  the new nonqualifying contract; its initial stale check is retained.
- Independent source review, coordinator adoption, generated-inventory refresh,
  exact-source commit and actual opt-in dispatch are still required. Keep the
  current default workflows running while reviewing this source package.

Private preparation evidence is in
`.local/upgrade-evidence/nov17-new212-container-timing-preparation/`.


## Actual isolated strict-container replay

[Run 44169079491](https://github.com/utilityfueled/tax-engine/actions/runs/44169079491)
passed on source `2fccaa27f2305e2f59db43a0067e19f4c631898f`, image
`sha256:b3ab501e670140493cf2986fae5096db4a7b079262c28a21688d0ba63046fd4b`.
Both unchanged cases passed: desktop 24,191 ms and mobile 18,861 ms. The
configuration retains two workers; the single selected file used one actual
worker. All 40 fixed timing records completed successfully. Response-wait
intervals were 2,213/2,040 ms, and Python-call wall intervals 2,389/2,146 ms.
These intervals include wall time and are not CPU attribution. Owned normal
container stop/removal and runner cleanup completed.

Root verified all 14 evidence-file hashes and the case/phase/configuration
records against manifest `4a11df011367a8e0cedf2adfe306580493b9e665e488f5a22d24cfa9a26bbdfd`.
The source/image/strict-settings proof is recorded with eight exact-Git source
pins. This isolated pass neither establishes the earlier full-batch failure's
cause nor substitutes for the current complete browser suite. Original failure,
deadline, action, assertion and readiness gates remain unchanged.
