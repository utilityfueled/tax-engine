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
14:33:02 UTC. Workbench shows a scheduled retry. The same-event success,
database readback and isolated resource cleanup are still open.
[Stripe retry behavior](https://docs.stripe.com/webhooks#automatic-retries).

| Evidence | SHA-256 |
| --- | --- |
| Two original Stripe receipts | `a03843153e88de9d1539852f91c25b478441d5f120f466e0fb015c064b609b7d` |
| Protected workspace isolation | `1bed58e9b8d89912411d06d84ae11650ab5d9820e7b6fac87b669a81e5ace664` |
| Actual first 503 and verified role restoration | `ae715734697dfc4c4a8442419d5e707029612483bc4d84418aeb003a4f53a345` |

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

The exact `115cbb52` tracked archive is undergoing a new ARM64 build, recovery
run and full Chromium suite. Full native Chromium, current-source AMD64
evidence and release qualification are open.

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
