# November 3 self-host recovery failure investigation

This is an offline investigation plan, not a recovery pass or causal fix. No
application, test, assertion, timeout, retry, privacy policy, workflow or container
was changed or executed for this review.

## Observed failure

Run 41622572369, job 125872005940, failed the upgrade phase on native linux/amd64.
The previous-image phase passed: database rows and exact cost, local browser facts,
original document bytes and runtime restrictions were verified. Candidate upgrade
then failed the unchanged 30-second return-heading assertion. The saved page was
complete but still displayed “Loading your return...”. No subsequent recovery,
rollback or re-upgrade phase passed in this run.

The raw log SHA256 is
`ab72755a2d3d650e7be5d69f8d7a24383322748d88b19c9824ddf20fddf587df`.
The actual previous image was
`sha256:e75ff614a59672f2b932b85af81d287abc981624bb9f7c7305d3c19e3c500e2d`
(source d32cb8cf3d607c643c4c7f7e1b845fcace61563f). The actual candidate was
`sha256:7fe456b17d58851e300d84cc5f48e56c093a4481ed57480775e9bb8dfbc1e5fe`.
Its smoke evidence records OCI source revision
`1aa383805c51b030786beeb82a13725255689226`, the PR merge of branch head
0100f40c50ff350b074b22f546472a6a7e1482de into f1f79ec5. The merge object is
not present locally; tree equivalence to the branch head has not been proved.
A rebuilt image must not be labeled the same immutable image without matching its
actual image ID.

The diagnostic events include three script 404s for one same-origin “other” path,
one aborted root fetch, and finally one static script failing
`net::ERR_NETWORK_CHANGED`. There were no recorded page-error events and no event
limit overflow. The events are cumulative from the initial page; they have no
phase or timing field. The 404s therefore cannot be assigned to the upgrade. The
static asset's path is retained only as SHA256
`fc4487d424416b446507f809376f03a86a9b26d93585ed1a23914f709a5ab4d6`.
Its URL and whether it was a required hydration chunk are not established.

## Source implications and limits

`scripts/rehearse-self-host-release.mjs:172` waits for API health and performs a
fresh document navigation on the same persistent browser profile and origin.
It then requires the actual return heading before checking storage/database facts.
API health cannot prove JavaScript assets loaded or the client mounted.

`apps/web/src/components/return-workspace-screen.tsx:476` loads browser workspace
state in an effect. Both success and caught failure set lookup-complete; the
loading view at line1077 is shown before that completes. Local persistence also
uses a dynamic import (`workspace-persistence.ts:641`). A missing client bundle,
a pending import, or an effect that did not run could retain the loading screen;
the observed page alone does not distinguish them or prove data loss.

The rehearsal recreates only the web container before upgrade and reuses the
browser. A browser network notification caused by container-network changes is a
plausible hypothesis, as is failed/stale chunk loading across builds. Neither is
proved by the available events. Dockerfile copies the candidate build's static
assets, and smoke validated assets in a separate request path; that does not prove
the failed browser-requested asset was present, current or successfully fetched.
The prior arm64 pass does not resolve this native amd64 failure.

## Bounded causal reproduction proposal

1. First establish available immutable images and native architecture without
   pulling/building or running the rehearsal. Compare inspect IDs, source labels,
   build IDs and static-asset inventories. For the failed asset, compare hashes of
   synthetic `/_next/static/` paths from both images against the saved path hash;
   retain only digest, availability and owning build. If the original image IDs
   are unavailable, state that exact-image reproduction is unavailable. A fresh
   same-source build is a separate experiment with fresh image identities.
2. Run the unchanged six-phase script once on native amd64 with the original
   images if retained, its unique disposable Compose project, identical origin/
   persistent-profile behavior and existing 30-second assertions. Retain its
   failing exit and cleanup evidence. Do not add retries, longer waits, cache
   clearing or a new browser to make the baseline pass. If only a rebuilt source
   pair is possible, pin the actual PR merge tree and all image/base identities.
3. If the same boundary fails, request a private diagnostic-only companion run.
   Before the first navigation attach phase-labelled monotonic request start/end,
   loading-failure and navigation records. Record existing safe route classes,
   hashed pathname, resource type, status, cache source, safe network error code
   and phase only; omit raw URLs/query strings, bodies, headers, exception text,
   storage and document contents. Bound events and preserve the original failure.
   Observe container lifecycle/network events by project/container ID and time.
   Correlate the failed hash to the read-only asset inventory and document build.
   No production telemetry or raw browser netlog/HAR should be introduced.
4. Only after baseline evidence, use a separate synthetic diagnostic experiment
   to distinguish mechanisms: keep a persistent browser/origin while recreating
   the same image, versus upgrading; compare an independently started clean
   profile without replacing the original recovery test. A single controlled
   required-chunk failure can establish the loading symptom, but cannot itself
   prove the remote failure's cause. Any proposed fix requires a fresh regression
   and unchanged original six-phase rehearsal, then both native architectures.

No runtime lane is requested to run a speculative fix. The next authorized lane
should first inventory images and choose exact-image versus explicitly rebuilt
source reproduction; native amd64 may require the existing remote runner because
local arm64 emulation would be a different environment. Final current-head native
amd64 and arm64 recovery remains pending independently of this offline report.

Machine-readable source/log bindings are retained in
`.local/upgrade-evidence/nov03-recovery-offline-review/evidence.json`.

## Read-only local image availability check

The initially sandboxed metadata requests failed with an operation-not-permitted
loopback connection. Those failures were retained and do not mean the engine was
down. Repeating only read-only Podman metadata queries with approved loopback
access succeeded: Podman5.8.2, Linux arm64, kernel6.19.7-200.fc43.aarch64, hosted
by Darwin arm64. No VM or container was started or changed.

Both exact remote amd64 image IDs returned “image not known”. All13 retained
tax-engine-tagged images inspected are Linux arm64, including source-labelled
d32cb8c image `a19e168da153371ff7ec30a27340cbcc7fd248585216b54c3806d7964f3dcf87`,
which is a different immutable image from the failed remote previous image.
The newest labelled application image in this local inventory is the historical
97698bc0+patchdb4a0fb5 runtime-minimization candidate, not0100 or current source.
No exact candidate build ID or static-path inventory can be recovered from an
image absent from the engine. No filesystem mount/export, pull, build or
rehearsal was attempted.

Consequently this machine does not provide a native amd64 reproduction lane.
A local source rebuild/emulation would be a different experiment and is not
needed merely to replace the missing original-image evidence. Retaining actual
source/image identities and recovery logs from the existing native amd64 CI
runner is the next concrete evidence option.

The parent reports a newer remote3b run41626314355/job125884714488 completed its
rehearsal step successfully, before a later image-browser step was canceled by a
new push. This supplemental status has not been independently fetched in this
read-only local inventory. If confirmed by its actual job log, retain the step
pass separately from the canceled whole job and the earlier unexplained0100
failure; no speculative fix or causal resolution follows from that success.

Inventory evidence is bound by
`.local/upgrade-evidence/nov03-recovery-offline-review/image-availability-receipt.json`.

## Actual subsequent native-amd64 log retained by parent

The actual125884714488 job log is now fetched and retained, SHA256`71c87825446a2982622006dc3b0d54e8ebb531b2992b8fba83bdbb550a19353a`. It confirms branch3b2a5e74 was checked out as PRmergef9b53fa79170cd148177d615209e6c5ad41f0a76. Six unchanged recovery phases pass on linux/amd64: previous, upgrade, database restart, dump/restore, rollback and re-upgrade. The actual candidate image isbc3d8c38805bcaedcbf7d1ebcd2513261101542ea10cbe6dcf3deee810e9e8d0; previous4327c7e221ef52fac0a979bf9b881556da9c4e50465f0b421dfd05e325487043.

Each phase retains identical database/browser-original/document hashes, nonrootUID1001, read-only filesystem, dropped capabilities and no provider keys. Actual database restoration covers9tables/two tenants/exact cost/idempotent metadata cleanup. Browser recovery reports originalbytes/unknownyear/exactcents/deletion, wrong-password/tamper rejection and its bounded raw-marker network check. Those are local synthetic runner results, not hosted staging or a general encoded/binary PII proof.

The subsequent543-test runtime-image browser suite shows a timeout marker before later push cancellation. It has no complete pertest verdict here; SBOM/scan steps were skipped. The entire job remains canceled and does not qualify the image or full browser suite. The earlier0100failure is still retained and unexplained; this new different-image pass provides no causalfix. No timeout/retry/assertion/privacy/product/workflow change was made.

Machine-readable exact recovery result is `.local/upgrade-evidence/nov03-head3b-container-recovery-pass.json`. [Actual job](https://github.com/utilityfueled/tax-engine/actions/runs/41626314355/job/125884714488). Final integrated nativeamd64/arm64 image/browser/SBOM/advisory qualification remains required.

## Current0aa native AMD64 rehearsal, browser failure and scan

[Actual job125899047742](https://github.com/utilityfueled/tax-engine/actions/runs/41630510881/job/125899047742) completes six unchanged recovery phases on actual PRmerge`7efde66aa49b2deb556a84238ee065745fe2a2ba` for branch0aa22e7f. Candidate`sha256:4f25c572e3c29e031b8f85914cfeb4f702c5fc528416a182c8f648eee5e79a8a`, previous`sha256:e6e61f283a898eccd773086d39e8a3514a356cd084ad8f38b43756b22112feb6`. Source-image identities, identical data/browser/document hashes, nonroot/read-only/dropped-capability constraints and exact9table/two-tenant restoration are in the versioned runtime receipt. This different-image pass does not explain the earlier0100failure.

The whole job FAILS: actual runtime browser538pass/2fail/5hostedskip. Separate self-host browser job has the same counts and exact desktop/mobile PA royalty failure at missing Pennsylvania header; the federal211001 assertion passes first. The old seed lacks the actual PA residency/return/completion sources now required. A separately scoped source-first browser successor is in progress; no timeout/assertion/readiness waiver is applied.

Unlike earlier canceled jobs, current SBOM/scan completes. ZIPartifact13229428647 digest`c2fcb63e1f44c424b7221d462b8ca0cbebea3f053130ab6244975c4811585e8e` was downloaded and verified, then actual JSON was inspected:176matches (59High/62Medium/11Low/44Negligible),80unique IDs,0critical. SBOMSHA`4000ef68cac2a973bb8ca897a4f66b03975bdc4ec98c4692d9cc6bc58b31dedd`; scanSHA`f0f6192ba55ef4727f6458483a513bd0d1cc76ec0d6508083d80e29d79617cdc`. All80IDs exist in the current advisory registry; historicalAPT CVE-2011-3374 remains absent. Existing release-maintainer owner confirmation is still pending with Nov7 review expiry. A successful critical-only scan step does not accept lower-severity findings or qualify release.

Remote coverage job125898712720 on the0aa workflow passes23,215tests/1,772files,0pending;91.70statements/87.31branches/90.57functions/94.78lines. Dedicated fresh local PostgreSQL16 replay also passes45tests/5files,0skips, log`789f19360c4376a7ea0d872c6588f3a3c356015a223e6a1f48beab8cf9de6c7c`; disposable loopback server stopped and cluster removed. Neither replaces hosted staging. Current reciprocal package6d9144e3 is pushed after its1362Ohio/13checks pass; final integrated coverage/images remain required. Machine-readable evidence: [runtime receipt](upgrade-2026-runtime-0aa22e7f-amd64.json).
