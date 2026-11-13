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

## ARM64 self-host

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
