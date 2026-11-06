# Container CI execution and evidence retention

The container job now permits 90 minutes for the complete build, migration,
recovery, browser, SBOM and scan sequence, and attempts its existing evidence
upload even when canceled. The ordinary browser deadline remains30seconds,
with2workers/zero retries. Scanner severity/failure settings, source verification,
all assertions and owned-container cleanup remain unchanged.

At6a5c8696 the separate managed browser job passed, while the container browser
step failed25cases. Detailed saved failures include whole-test deadline exhaustion;
their causes are being investigated. Smoke, recovery, SBOM and initial image/source
binding passed. Grype was canceled, its final binding and artifact upload skipped.
The job's60minute envelope is consistent with that cancellation; an explicit
cancellation cause is not retained, so timeout is not claimed as proven. No final
scan or container-runtime-evidence artifact is invented. This workflow change
repairs neither the browser failures nor the scan result. Always-upload also
cannot guarantee execution after abrupt runner loss.

The exact two-line delta passes raw byte reversal and parsed-YAML equality.
All58 existing browser orchestration/build-cache controls pass. Proposal manifest
`5b164267f77f7f82c76af60c6da600dcbedcb83b5a1e5897ea224d8090e88221`;
ROOT main manifest `cdbf7e2714d99c9586fcfc19ed389f4db8680801fc211a5362c20c9d3647392c` under
`.local/upgrade-evidence/nov05-container-job-envelope-main/`. Earlier25failure
contexts and job metadata remain in `nov05-remote-6a5c-container-close/`.
A complete current-source remote run and actual final-image scans remain required.

The initial compact log projection omitted two earlier failures. A separate retained
count correction records the actual final25-failure orchestrator result; manifest
`5a24605b9f3367fdfe2dbb4e8259fb1dc3ac6fc14121faaa083298b391289858`.
