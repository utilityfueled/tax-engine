# November 4: a4ac remote verification

Application source is `a4ac9f0ea004bfaed3f9713af62a3bf1b56f0d45`.
These are completed remote observations, not evidence for a later source or a
release qualification. The GitHub metadata refresh confirms
[CI success](https://github.com/utilityfueled/tax-engine/actions/runs/41872762743)
and [Web failure](https://github.com/utilityfueled/tax-engine/actions/runs/41872762805).

| Check | Actual result |
| --- | --- |
| PostgreSQL-backed unit | 25,238 passes, 1,853 files |
| Coverage | Same 25,238 passes; statements 91.81%, branches 87.54%, functions 90.69%, lines 95.03%; unchanged 90/85/90/90 thresholds |
| Types, spec, lint, build CI jobs | Successful |
| Managed browser | 565 passes, five hosted skips; configured retry count one does not establish zero actual retries |
| AMD64 container browser | 550 passes, 15 failures, five hosted skips; 30-second deadlines and zero retries |
| Image smoke and synthetic recovery | Smoke and all six recovery phases pass |

Skipped hosted cases supply no staging evidence. The container failures remain
failures: one home case, two Ohio part-year business cases, four reciprocal
cases, four resident-credit cases and four part-year school cases. Independent
saved-trace analysis finds cumulative action-budget exhaustion; it supplies no
CPU attribution or proof that a final field is defective. Raw traces remain
retained. The earlier b254 541/24/five result remains separately attributed;
these different runs do not establish a causal performance improvement.

## Immutable image and source binding

The synthetic merge `e28f71074e8824d5b42cf38054ce465de082c820` has tree
`696da57a66191f7b7d2127d84bba1f6101339be5`, identical to a4ac. ROOT fetched
that exact object and verified its parent, tree, Dockerfile, lockfile, workflow
and Git archive. The archive SHA256 is
`ebb7adc57524e7439540cffde0ce3b25779451d0c7b5209c7d868f57db401c63`.

The actual Linux/AMD64 image is
`sha256:534f7cc0f8e370272fc8eac0ffc7b8e9c5783a4ebeaf99143cdcf077c0362c48`.
Both SBOM and scan raw configuration hashes reproduce that image ID. Complete
configuration, source labels, platform and all ten rootfs layer identities
agree. Qualification does not rely on a mutable tag.

The scan retains 181 matches across 80 advisory IDs: 61 High, 65 Medium,
11 Low and 44 Negligible, with zero Critical. Those counts are not risk
acceptance. All owner decisions and their existing deadlines remain open.
The 15 browser failures leave this image unqualified.

The recovery observation includes nine-table restoration, exact monetary
values, metadata reapply/idempotence and finite browser encrypted-backup
checks. Saved network text checks do not establish privacy for every encoded
or binary payload. Neither this recovery nor its scan supplies a human
security/privacy decision.

## Retained evidence

Private evidence is under `.local/upgrade-evidence/nov04-current-remote-workflows/`.
The downloaded artifact is ID `13348471705`, 724,069,934 bytes, ZIP SHA256
`73b48ebf6fdd6e722927d30e0dc10a86a14300401f050c63852fe60fc1dda015`.
The binding receipt is `a4ac-container-artifact/root-binding/root-verified-receipt.json`;
its status is `PASS_IMMUTABLE_IMAGE_SOURCE_SBOM_SCAN_BINDING_ONLY`.
The retained coverage log SHA256 is
`de50eeebd80f233559c47e9f22256c0b2122685a7d02af8382d84344162d1f87`;
the container terminal log SHA256 is
`be848d9bf11c01429eaf6a0bef1cb6e047655a00087eb2ae4f21e57513c04f09`.
The final workflow metadata receipt SHA256 is
`e28aa736017271ccf78cac3b165e09010dd7a634ec083a0e2c1d1967544142ef`.

Later 8487 changes only a PA unit-test stdin-reader import and its engineering
ledger. Its application bytes are identical, but its ongoing local full checks
and planned ARM64 artifacts keep their own source identity and results.
No production deployment, release, filing activation or model promotion follows.
