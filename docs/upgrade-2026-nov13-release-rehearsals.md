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
The corrected rehearsal is running with the `6cccc932` tracked archive.
The runtime image, Compose recovery, native Chromium, SBOM and advisory
dispositions remain open.

The earlier normal-stop receipt SHA-256 is
`c307ba49ff828bf86ff27c39ea89f2f66d4c22b6b08ed8be7eba1f1d784ea60b`.
