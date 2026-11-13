# November 13 isolated release rehearsals

## Hosted Preview

The tracked archive at `ab47d87f44597b4b43228ce17076098eccdecff9` passed
all 12 local checks before deployment to the isolated protected Preview.
The second build enabled the Preview-only workspace backend. Both synthetic
owners signed in and wrote distinct facts to the same return ID. Each
reopened their own facts. Anonymous access returned 401 with private
no-store headers. The original two signed Stripe Sandbox events received
200 and each left one database receipt. The two subscriptions were active
and all five actor-scoped AI credit and usage counts were zero.

The first suspension and two later preflights stopped before sending a
marker while pooled connections were still open. After the pool drained,
the restricted test login was suspended and a connection received SQLSTATE
28000. Stripe Workbench records the original marker's signed delivery
returning 503 at 14:32:17 UTC. The restricted login was restored at
14:33:02 UTC. At 15:31:58 UTC, Workbench shows that Stripe retried the
same signed event and received 200. Stripe reported zero pending webhooks
for the event. Read-only verification found one receipt for the retry,
one receipt for each original event, only the first account's subscription
marker updated and all five scoped AI effect counts at zero. There were no
manual resends. Both no-card trials were canceled without invoicing or
proration. The original Sandbox webhook URL and enablement were restored
and read back. Vercel removed the three disposable Preview deployments
and both test-only configuration rows. The other Preview settings matched
before and after that cleanup. The isolated Neon branch is scheduled to
expire November 14 at 08:45 ET. Its final removal has yet to be observed.
[Stripe retry behavior](https://docs.stripe.com/webhooks#automatic-retries).

A third protected Preview of `ab47d87f` used a deployment-local synthetic
invalid Redis REST token with the isolated Upstash endpoint. Its unauthenticated
platform request redirected to Vercel Authentication. With platform access,
the application returned its `rate-limit-unavailable` 503, `Retry-After: 5`
and `Cache-Control: no-store`. The healthy Preview returned a private 401
before and after. The fault was a Redis credential rejection. No provider
rotation, cross-project Redis access or live AI calls were needed.
Readback verified that the isolated cache's only connection was removed.
The targeted cache deletion then returned 200 and a subsequent lookup
returned 404. The remaining isolated project settings matched.
[Upstash REST authentication](https://upstash.com/docs/redis/features/restapi).

| Evidence | SHA-256 |
| --- | --- |
| Two original Stripe receipts | `a03843153e88de9d1539852f91c25b478441d5f120f466e0fb015c064b609b7d` |
| Protected workspace isolation | `1bed58e9b8d89912411d06d84ae11650ab5d9820e7b6fac87b669a81e5ace664` |
| Actual first 503 and verified role restoration | `ae715734697dfc4c4a8442419d5e707029612483bc4d84418aeb003a4f53a345` |
| Stripe Workbench automatic 200 | `834351799c78fe0d60d9eddef571bbe1ab8642366236004d6b16fe96ec76ae88` |
| Exact event, receipt count, tenant and ledger readback | `c9f45653d318c54cf1fe039b849b95ee127484184f671fa28eac2a89f1131416` |
| Stripe Sandbox cleanup receipt | `cd30e603263f990a723d858bae6b2e8b584441967f2167a98517cdc288a8e6a8` |
| Isolated Redis credential fault and healthy controls | `7e7092451ba2782e735029646bb89e7f0c01b1a982127219b2ac1e0b6dd3d785` |
| Removed disposable Preview deployments and settings | `6f1fc655b1517e4c44b5841f0ddf6860bb63f42392939378e1110b9f23fb58d4` |
| Exact isolated Redis disconnection and deletion | `c17d296f9fc3ca51ffbc77dacdaa4d8f93f023108fc947ff72ac3f77af58fade` |

### Protected Preview startup and runtime faults on `b7ffd2c1`

Two earlier `a445aad7` protected builds returned 500 on liveness, auth and
workspace. Both were removed. An isolated `b7ffd2c1` build reproduced the
failure with runtime logs enabled. All four captured records identify the
instrumentation guard that requires both Redis REST settings before a hosted
runtime starts. The harness had originally expected the route-level 503.
The captured startup failure and its assertions are retained.

A second protected build of the same source used a deployment-only
synthetic token and a loopback Redis URL on an unreachable port. Vercel
Authentication returned a 302 before access. With the private bypass,
liveness returned 200 and no-store, workspace returned the private no-store
503 with `Retry-After: 5`, and auth returned its private no-store 503 without
the auth database. The isolated project settings were unchanged. Each build
was deleted by its exact deployment ID and subsequently returned 404.
Each controller recorded 18 HTTP operations. This covers hosted startup and
fail-closed fault behavior. Exact-source healthy staging qualification still
needs reachable isolated services and the full end-to-end run.

The same source separately passed 13 production HTTP checks through two
local Next processes, Better Auth, a TLS-enabled PostgreSQL 16.16 instance
and controlled REST failures. Cleanup passed. Its first run exited on the
PostgreSQL SSL precondition. The replacement PostgreSQL build was compiled
with OpenSSL and the same verified release source before the rerun.

| Evidence | SHA-256 |
| --- | --- |
| Missing Redis startup receipt | `c68586d68e6947dc9d1825ab1e8c1ef263dcbdf5885bd5cc0cfeacaa5aca1688` |
| Missing Redis runtime logs | `cc6615bfcc0be552d6716434df6d67f3217326f5c93df972718adcabdb0f26ce` |
| Loopback fault and verified deletion | `570052e5ae06a34a9c9902f878d2167dc2d91c21d927338aa8b345a27554c83d` |
| Local production HTTP and TLS cleanup | `1392d150f40f9cba76fd4bc54485352adcbb400404ec9bf5e8808ebceef8dd2a` |

## ARM64 self-host

### Completed archive at `a445aad7`

The native Linux ARM64 runtime passed separate image-store import and
smoke, SBOM generation and Grype scanning, six Compose recovery phases,
and the browser rehearsal. Chromium collected 621 cases, passed 616 and
recorded five hosted-only skips. The test VM stopped normally with zero
cleanup errors. Its user socket route was restored and the root socket
route and default VM were verified unchanged.

Grype recorded 197 matches across 86 IDs, including 60 High and zero
Critical or available-fix matches. The findings remain open for the
security owner's disposition. The evidence belongs to the tested archive.

| ARM64 evidence | SHA-256 |
| --- | --- |
| Tracked source archive | `7b339c8ec9af57bff12fd9158fb7a619ee35513a7a2e8cf3a890232dbb48ab67` |
| Runtime image ID | `1253a46fbfeb9ee12f2a9ea7eb05e745af591a407ee7eafca8e59e1be54f6dd3` |
| Runtime image archive | `c358b5bcdcd52ca6310db0e548b2aa42d4a1afc2487994afd02117c50db3869f` |
| CycloneDX SBOM | `d4b76f4ab1eedfd78786ae0687fa88b97da0475d1494d7e8b582966c23c2d646` |
| Grype scan | `03c0da2cf21b11747e51fd4510c29c5c821b57f8e51d8b02152bf67f3fa24265` |
| Compose recovery | `4c15a8f73bc344f935b3dace6eb5175583819920a3d81207478183590a802492` |
| Chromium transcript | `1684afe7f97cd6f2bf584b93b544de4d57164c71bac099881aef684ec7ea82af` |
| Complete rehearsal receipt | `92614bc2a3f0c7a143b119ba12a783bb3887db82c5aeccdfe975c88d7b7806f2` |
| Normal stop and socket restoration | `cd32053478e94fc27e16e991280a6f3de2d3580c6280dd1e44122dc93d318b40` |

### Earlier ARM64 runs

The `c94971cd` rehearsal booted a native Linux aarch64 guest without host
filesystem exports, then stopped normally and restored the original user
socket route. It found 76,500,164,608 available guest bytes and stopped before
the build. The stopped disk's GPT and partition-table CRCs validated. The
disk file was 384 GiB and the partition still ended at the original 80 GiB
disk boundary. [Podman resize report](https://github.com/podman-container-tools/podman/issues/25890).

A separate empty, rootless VM was provisioned at 384 GiB before its first
boot. Its XFS filesystem reported 401,849,769,984 available bytes, above
the 382,520,449,024-byte requirement. The first diagnostic then stopped on
a Podman template field capitalization error and restored the socket route.
The corrected `6cccc932` archive built a native image, imported it into a
separate runtime store and passed smoke. That source failed the later
original-document recovery check. A focused reproduction tied the failure to
an upload saved by the rollback image before it recorded `lastModified`.
`2e258445` derives the expected legacy timestamp from the persisted upload time,
preserves an explicit zero and checks the restored document's identity,
filename, media type, timestamp and bytes. No production recovery rule or
browser timing limit changed.

The native `2e258445` image passed independent import, smoke and the six
Compose phases: prior image, upgrade, database restart, database dump and
restore, rollback and re-upgrade. Encrypted restore rejected a wrong password
and a modified archive. It recovered the original synthetic PDF, year and
exact cents, and passed deletion. The capture found none of the checked raw
synthetic markers in 399 request URLs and bodies.

An initial full Chromium attempt stopped before collection because the staged
fixture registry had the wrong mode. A second reached the live inspection
and stopped because Podman 6 expands the capability drop and adds fixed
tmpfs options and two environment entries. Native inspect reported empty
effective and bounding sets for the same running container and image. The
guest kernel showed all five capability sets at zero and `NoNewPrivs: 1`.
`93d6b26e` admits only that observed metadata profile and verifies the
empty capabilities through the fixed read-only Libpod route. All 170 focused
checks passed. `115cbb52` also binds the optional CPU diagnostic to the current
621-case collection and reviewed audit. All 14 diagnostic targets are
unchanged, and the 25 diagnostic tests passed.
[Podman 6.0.2 inspect source](https://github.com/containers/podman/blob/v6.0.2/libpod/container_inspect.go#L178-L181).

The exact `115cbb52` tracked archive passed native import, smoke, scan and
Compose recovery. The browser runner's canonical directory URL has one
trailing slash. The inspector rejected it before browser collection.
`3b5b2ca6` accepts that exact URL path and continues to reject aliases and
relative segments. All 196 focused checks passed. Its replacement ARM64
image passed import, smoke, scan and all six Compose phases. Host Chromium
against that native Linux ARM64 image passed 621 cases in eight batches,
with five existing hosted-only skips and zero failures. The VM stopped
normally and the user socket route was restored. That rehearsal is tied
to `3b5b2ca6`. Later calculation changes and exact-source AMD64 evidence
remain to be qualified.

| ARM64 `3b5b2ca6` evidence | SHA-256 |
| --- | --- |
| Runtime image ID | `de3f45da4a9ef062a2776954934f3222d52de2d60b3eb8434344ad391d952e36` |
| Runtime image archive | `ba34754984e081235d4866a5ce09a1ee9441c140e223a3fb0b8855a62c388001` |
| CycloneDX SBOM | `22fa562af6bc0c52bea7c464e10245b1108478a07dc819d6df04985b45e86b2a` |
| Grype scan | `906ae6a5f098a60a8cfc94cb6918974a600cd1ec5c38e70ef6f9f69dd4857cfd` |
| Complete rehearsal receipt | `dcd259d918a346942a412d21db0fa202b9736e11f3de5a04e05f2966e25af328` |
| Normal stop and socket restoration | `cd32053478e94fc27e16e991280a6f3de2d3580c6280dd1e44122dc93d318b40` |

| ARM64 `2e258445` evidence | SHA-256 |
| --- | --- |
| Image ID | `b4f9d4ccd97038f61afed7d7f0ffffd8f156401afb76c35ae401d8e4eb671994` |
| Image archive | `134d0c66999ab8661d0081aa434eea30e791743e6d75d39b22a4ec42dca86c14` |
| Runtime smoke | `9d1970474b5e29bc118cb6948ce5e660170d5c4a97dfab9e337aadcb180e8242` |
| Compose recovery | `a08cf76a8c6e86a071b4f697121034796d43b9ff52dd25a89a3d5c44ebd369b1` |
| CycloneDX SBOM | `7ad46b702890d7a13b85e47cac21054ec858d87030130505112a040e7c0c8d13` |
| Grype scan | `ec9326ab0357a805ff417a918cd5b6e5075e4c64bd9c48535fd32c3633452680` |
| Native capability report | `e30d6838e8e1af544e9801642f70ef6422626ae13cd5fabbe8df63b3ff0b6c24` |
| Kernel capabilities | `52ebea7f86d047a774766e0801e33bc1499495131a7b418ca075c2d51e570d14` |
| Normal stop and socket restoration | `cd32053478e94fc27e16e991280a6f3de2d3580c6280dd1e44122dc93d318b40` |

The November 12 Grype database found 197 Debian package matches across
86 advisories, including 60 high-severity matches across 17 IDs. It reported
zero critical, npm or available-fix matches. The current Debian tracker records
all 86 as open on trixie. Three historical zlib CVEs are absent from this ARM64
scan after the pinned Debian update. Eight other CVEs are newly matched
compared with the November 6 AMD64 register. All still require security-owner
disposition. [ARM64 advisory register](upgrade-2026-image-advisories-20261113-arm64.json).

The earlier normal-stop receipt SHA-256 is
`c307ba49ff828bf86ff27c39ea89f2f66d4c22b6b08ed8be7eba1f1d784ea60b`.

### ARM64 follow-up on `f4b0b608`

The first `8d666cc1` transfer stopped when the system Python lacked
`hashlib.file_digest`. A second attempt passed image import, smoke, scan
and recovery. Browser collection rejected the supplemental fixture registry
mode. The next stage verified mode 0644 and all fixture hashes. An
`f4b0b608` preflight then stopped at the existing host-space floor before
boot. Removing generated dependencies and builds from six completed
temporary checkouts freed enough space for the retry.

The admitted `f4b0b608` run built and imported the native image into the
separate runtime store, passed smoke, recovered through all six Compose
phases and passed 621 Chromium cases with the original five hosted-only
skips and zero failures. The encrypted recovery captured 401 synthetic
requests and found none of the checked raw markers in their URLs or bodies.
The scan matched all 197 earlier findings by advisory, package, version,
severity and fix status. The 86 advisories still require owner disposition.

The tool interrupted the outer controller after the browser success log.
The original controller did not write its final receipt. A separate
cleanup verified the candidate image and operation label, normally stopped
and removed only the owned browser container, stopped the named test VM,
and verified the original user socket route, root link and default
connection. Two separate interrupted local suites left disposable
PostgreSQL clusters, which also shut down normally after PID and data
directory verification.

| ARM64 `f4b0b608` evidence | SHA-256 |
| --- | --- |
| Tracked source archive | `330a80e4274c45914bd04250b254052b73a00db4127870b94d0dabdc62b3b596` |
| Runtime image ID | `d6386f125e767bf8147dc0991f3e2f6e8dc1ffcc440eb0bde6a3a6b18b2337cc` |
| Runtime image archive | `098270332392e3115bd7df577326302a10a66a702f02ae68ddc14c1a030200ca` |
| CycloneDX SBOM | `8b3b5fa5808b6372993dba5ad92b45ffa192aa989a4fbe6ecb65f678a182967a` |
| Grype scan | `91bc9b36481a135ee87d20a47fdff1e962ef381dbbfbbd7e34d0d724bf53e754` |
| Compose recovery log | `b734df13865ffb44387f74d0a208d8aefc142dd181c396cde4b25d896bbcacea` |
| Native browser log | `b3fdbd29761fda0ad922af43f9c666d379c80a55992c0f0019dd8d5acd1d0fcd` |
| Separately verified cleanup | `b94026ddfbd4b762807e0023a4b0e20851218f70a2a7368269986efa3507c529` |
