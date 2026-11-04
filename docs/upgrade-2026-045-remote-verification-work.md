# Exact045 remote verification and retained container failures

November 4, 2026. Functional source is
`045fbedbdfbe612cb3caa28956fa7228bb3df320`, tree
`cc964be84406697ce2b15e60f7d6c9cc148af2b7`. The later evidence-only commits do
not change application bytes. This record does not qualify a final image.

Both the [push CI run](https://github.com/utilityfueled/tax-engine/actions/runs/41925117138)
and [pull-request CI run](https://github.com/utilityfueled/tax-engine/actions/runs/41925125035)
complete successfully. The retained push logs report 25,244 unit and 25,244
coverage passes across 1,854 files, with unchanged coverage
91.81/87.54/90.69/95.03. The separately attributed
[full local run](upgrade-2026-045-full-local-verification-work.md) also passes.

The [push Web run](https://github.com/utilityfueled/tax-engine/actions/runs/41925117220)
and [pull-request Web run](https://github.com/utilityfueled/tax-engine/actions/runs/41925125083)
both fail their actual-runtime container browser job. Each separately passes
its managed-browser and web-build jobs. Retained push managed-browser logs
report 565 passes and five hosted skips in 29.8 minutes. Those skips establish
no hosted qualification. The container reports 541 passes, 24 failures and five
skips in 47.6 minutes, at the unchanged 30-second deadline and zero retries.
Smoke and the isolated six-phase Compose recovery step pass in that run.

## Actual traces and image binding

Read-only trace analysis retains all 24 failed trace ZIP hashes. Their bodies
exhaust approximately 29.87–29.96 seconds before teardown. Field-heavy Ohio
journeys perform 225–286 fill/press/select actions, costing 11.86–14.67 seconds
combined. These are action wall times, not a JavaScript CPU profile. Overlapping
wait intervals must not be added as separate elapsed time. In one mobile Ohio
business case, PDF waits start at 26.60 seconds and finish after teardown begins;
its later filing-rejection stack frame does not establish a slow rejection path.
No deadline, retry, action, validation or readiness gate is relaxed.

Independent evidence-binding checks pass 20 assertions for immutable image
`sha256:98569b07d935492a7e36792d2e65d1b4c38d2e795562e1834167b3fb3f47dcf0`:
actual browser identity, source labels, linux/amd64 platform, ten rootfs DiffIDs,
decoded config hash, manifest descriptor, both SBOM formats and Grype source
agree. Browser read-only rootfs, dropped capabilities, no-new-privileges and
loopback publication also agree. Provenance agreement does not clear failures.

Actual Grype 0.121.0 evidence reports 181 matches: 61 High, 65 Medium, 11 Low,
44 Negligible and zero Critical. Its database was built November 4 at
06:20:59 UTC and reports valid. Existing advisory owner decisions remain
unaccepted; this analysis changes no advisory disposition or expiry.

Private retained SHA256 bindings:

- Unit log: `0aacca260dabc6419a67be14fef2089d004c582c1dfdab3ce355e1dc5f89fe73`.
- Coverage log: `9b8b3b6ec803fd0a8567bb4383a87634c9a5db17a79d00221614bbf3db7f16b7`.
- Candidate inspect: `79aca6dcccb470ff0aa18924fdaa1ed1f91ffd637a34eaece599511576b55101`.
- Source/SBOM binding: `f90d6dbf9fc4c5e9cf0fc550495bd185d4f6dc5f4d86f93cd1a6804908e01bfc`.
- Syft SBOM: `7a7b4053fdba579b4eed0662beaa22bfaef3ff529866c2d0be180679fb8c6f9b`.
- CycloneDX SBOM: `ceb2a3e11cc5d30f6fe1f388b9b0de3795ddc599774ff6b959651acc9d843020`.
- Grype evidence: `46f68d42ef2bb3d05e4d42a928539396515be9356b7e9363449b08989b77e6b1`.
- Independent diagnosis manifest: `164997fc243ee0e30f4b8b67577bff3dea123ab28cc30adccbd1a508009665dc`.

The immediate implementation work is to profile and reduce repeated synchronous
per-edit preview/source validation while retaining immediate invalidation and
fresh complete-state semantics. No cache or performance change is delivered by
this diagnosis. Native ARM64, hosted integration, advisories, professional
reviews, live AI evaluation and final2026 form qualification remain separate
required gates.
