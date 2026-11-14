# November 13 isolated release rehearsals

## Managed runner corrections on `6ef4e05e`

Nine checks passed before the unit runner recorded 27,899 passes, 12 failures
and 55 skips. This invocation embedded the disposable SCRAM credential in the
private database URL. The integration guards require a passwordless loopback
URL. Coverage and Chromium did not run. The isolated PostgreSQL stopped
normally after its data directory was authenticated. The successor harness
uses the same passwordless loopback URL with a separate mode-0600 PostgreSQL
passfile and removes both from the browser environment.

| Evidence | SHA-256 |
| --- | --- |
| Exact check sequence | `74154c2c7a168cd3f640ab9d9f1abd408bbf34c244aee539698111636aacfb74` |
| Unit output | `90b0c0928dd1037ce675d62da145e90907916412ff799219ab5f1e85dc0fa7fe` |
| Unit diagnostics | `42a9bcad866814fa0a9882fe19a57862bd5e106a4fcb4a71fc60a8bad5a42e5c` |
| PostgreSQL shutdown result | `fceb5e3c3ee51d75c8b724e5e0b8090539dc718540e264b3f12f06a39717d115` |

## Managed checks on `f22c1560`

The corrected credential setup passed nine prerequisite checks and 27,980
unit tests with zero skips. Three tests failed before simulating an outage.
Their TCP proxy listens on a different loopback port, so the PostgreSQL
driver could not use the source port's password-file entry for the proxy
connection. The other real-database suites passed. The private cluster
stopped normally. This run did not reach coverage or managed Chromium.
`f830807f` uses the driver's direct credential resolution for the synthetic
upstream before testing through the proxy. It passed all seven outage cases
with real PostgreSQL 16.16 SCRAM and the three proxied outage cases on a
separate trust-only local cluster. The tests keep the real connector, fault
injection and existing deadlines. All three reproduction databases stopped.

| Evidence | SHA-256 |
| --- | --- |
| Exact check sequence | `74e8644f36a5c2239eed4d055d4b097285eb318e99ee8fb02af9d83813a96bfb` |
| Unit output | `8c4e085abb63b8b4ed4a3d5e17a8f53bef4dfa1573a67f71a56de5e187450342` |
| Unit diagnostics | `bb80ee9fc32e8975b907ef167752c68907fb6c4a51a2ebaee7a3f8ffde30180e` |
| PostgreSQL shutdown result | `fceb5e3c3ee51d75c8b724e5e0b8090539dc718540e264b3f12f06a39717d115` |

## Hosted capacity regression on `f22c1560`

The exact predecessor production build and the same six concurrent signed
requests across two Next processes created two additional returns for an
owner who started with 199. Four requests returned 400. The new assertion
expected one successful creation, and all 14 existing checks and cleanup
passed. The disposable local PostgreSQL 16.16 used certificate-verified TLS.
The signed sessions, accounts and returns were synthetic. Redis REST was
emulated locally. The retained receipt SHA-256 is
`3faaccbccdb269fa595a4fc9c50597dd69db6888e42c7daedb95ff5ba71caef4`.

## Local hosted HTTP on `86cf13d5`

The exact production build passed all 15 checks. The quota check observed
one HTTP 200 and five private, noncacheable HTTP 400 responses from six
concurrent requests. The admitted workspace remained editable at 200. Its
deletion freed one slot, the following request reused it, and the next
request was denied. The other owner's count remained zero. Cleanup stopped
both Next processes and closed all four loopback ports. The first execution
stopped before binding a loopback listener with `EPERM`. The replay used the
same tracked source and built artifact with loopback permitted.

| Evidence | SHA-256 |
| --- | --- |
| HTTP and cleanup result | `6174ebbbe6c09c5a9be56c90e09f1d6f6afd8d29966eb705a5dbd34149c43355` |
| Exact build loopback replay | `1a6c0a1a8e2fc36b84cf9685f75992fdfc4105b73a633eb3e6a89466afe2f1aa` |

## Managed checks on `dc7546f9`

Nine prerequisite checks passed. The full unit run passed 27,947 tests
with one exact lockfile-integrity assertion still bound to the prior
Nodemailer 10.2.1 lock. Both previous Pennsylvania PDF timeout suites and
the five live local SMTP/PostgreSQL tests passed during this run. Coverage
and managed Chromium did not run. The owned PostgreSQL stopped normally.
`c8d15fb2` retains the exact hash assertion with the verified 10.4.1
dependency lock. The current and predecessor hashes were independently
recomputed directly from Git and the diff changes no other packages.

| Evidence | SHA-256 |
| --- | --- |
| Exact check sequence | `0bde7066714beec22136318eb4ddf65e6ff8a903c6e5415a93378d6a632bfc40` |
| Unit output | `8c53c6a53f2db6018a91f0321e9266bfee9fd17e57ab8fdcab7086eda5aaeb0e` |
| Unit diagnostics | `a3220ed1d0e31dfe68bb10f68567a99ac5ff886dbc55f2f80630b0a6eecb2e` |
| PostgreSQL shutdown result | `fceb5e3c3ee51d75c8b724e5e0b8090539dc718540e264b3f12f06a39717d115` |

## Native ARM64 on `dc7546f9`

Independent image import, smoke, SBOM and scan passed. The shipped
Compose stack passed six recovery phases. Chromium collected 621 cases,
passed 616 and retained five hosted-only skips with zero failures. The
test VM stopped normally and the original user socket, root socket and
default connection were verified. The application scan reported 191
advisory matches, 56 High and zero Critical. This artifact predates the
new SCRAM rehearsal and provides no security disposition or AMD64 evidence.

| Evidence | SHA-256 |
| --- | --- |
| Tracked and verified public sample archive | `56479ac018795cb129dc468d2d2e172af53a357cb2811e5e9259cce6cb9daa4b` |
| Runtime image ID | `c9f733d9d6e908fa722f197f5d09e8bd45ac2a22976e7aef181cf37b817d1cc4` |
| Runtime image archive | `f81e2dd445117c7450f29c0c60792b287381d12e44a419ff131a39e94022010a` |
| CycloneDX SBOM | `752f6b6095c09c011caaed46eba1ff5c426ee4a79c047e958f943e7c4d60b3eb` |
| Grype scan | `5532f1b0cf0af5fe36103b73588d741ac48c04ceac7d549dd36713f0f0058982` |
| Compose recovery | `0329415f69bc336b338fa03c404a54d878e1ac98a83c713d905a257daf012d3f` |
| Native Chromium | `96a2e6814240611fa82b5f88481084d30b506469a9e20afdf1f9cfe3b0e915e5` |
| Controller result | `db3d1144633048377ccaf09a7c45a434d40752c4bdd79770a6a1ee1d3655af21` |
| Runtime cleanup | `cd32053478e94fc27e16e991280a6f3de2d3580c6280dd1e44122dc93d318b40` |

## Guided payment browser regression on `02e553cf`

Both new Chromium cases failed on `f830807f` because the actual guided flow
omitted the IRS application-year input for an out-of-window payment.
The updated flow passed in the 1280 and 390 pixel viewports, with zero
retries, a 30-second per-case deadline and zero API requests from either
case. All 25 payment cases passed with no skips. The 623-case collection
adds exactly two to the previous 621 and preserves the original 14
diagnostic cases, five hosted-only skips and four protected request limits.

| Evidence | SHA-256 |
| --- | --- |
| Predecessor browser report | `95713d29527ca271b93a86e60532d33383b1056f8e10113468f7b869513dd04b` |
| Focused payment suite report | `9500ef76d4e61284ecb9726a3be50f7e3677628436c33005a3e2c167a62667d2` |
| Request audit | `959d48c886aa0467c0de6ea2482c56ae7ee959880ac762714ce1d032eb064c7b` |
| Canonical Chromium collection | `c8ae753226b48877fb72ab0f98ca147a8389d06858ed6ad8f1b125cc621e331c` |

## Native ARM64 on `f22c1560`

The exact ARM64 archive passed independent image import, runtime smoke,
CycloneDX SBOM, application scan, all six Compose recovery phases and 616
of 621 Chromium cases, with five original hosted skips and zero failures.
SCRAM rejected both missing and incorrect credentials before and after
restart. Authenticated dump and restore reconciled 11 tables, exact issuer
and provider cost values, original local document bytes, and rollback and
re-upgrade. The VM stopped normally and both socket routes and the default
connection were verified. The initial public sample registry mode stopped
the first invocation before a VM operation. The corrected staging retained
the tracked registry bytes and used the required public-file mode inside
the private directory. The app scan still found 191 matches, including 56
High and zero Critical, with no risk acceptance.

| Evidence | SHA-256 |
| --- | --- |
| Tracked and verified public sample archive | `4677923759747e63e0a98ce932bcffcffdd796acc2386678d64c0959400fd56a` |
| Runtime image ID | `e62ff457c3341c25f58c9734c911185dc31614e2e9aec60f10a4b83e0121c16b` |
| Runtime image archive | `af270f54361caf6bbe23a5d81ce14094f80a0eb0c37cbb4c678a3112fa2537cb` |
| CycloneDX SBOM | `332b2f80d23ff2fabf189e731dd86523393522cd6c718289bcbeef25d9228a73` |
| Grype scan | `489d085471959a87de96db7b0dd7f4fbd2f76ab954af286959d2bc6932eb80dc` |
| Compose recovery | `683384d320db695eecbfb7199fac750e639bc1aefa7a366f651e25ed205c6519` |
| Native Chromium | `ca9a85dd118a2700a267acc882a63060f68b0d6b4ca797a5c832501a1bcb9105` |
| Controller result | `96e8277ad2fef999a8b93dee89d7b42acc7cf61634a0208649e223cce7476dcf` |
| Runtime cleanup | `cd32053478e94fc27e16e991280a6f3de2d3580c6280dd1e44122dc93d318b40` |

## Local hosted HTTP on `dc7546f9`

The tracked source passed a frozen install, production webpack build and
all 14 HTTP checks across two Next processes and actual certificate-verified
PostgreSQL 16.16. The synthetic Redis transport confirmed the shared limit,
pseudonymous keys and fail-closed disconnect, error and delay cases. The same
run confirmed synthetic two-owner isolation and deletion, database outage and
recovery, interrupted and oversized uploads, and finite application logs. Both
owned Next processes stopped and all four loopback ports closed. This run used
no Preview, Stripe, SMTP or model provider.

| Evidence | SHA-256 |
| --- | --- |
| HTTP and cleanup result | `d6dd10f6e3f939e27dbc6e78f44a2ecf7b66dc216b48f3bfe4254b5eeeb2f3a6` |
| Exact build and controller result | `9882164fe5781bf7cf4729d528cae4bcbf74711679238e539f70e918c8c24737` |

## Local hosted HTTP on `7924a91d`

The exact source passed a frozen offline install, a production webpack
build and 14 HTTP checks across two Next processes using PostgreSQL 16.16
with certificate verification and a synthetic Redis REST transport.
The checks covered cross-tenant access, deletion, request limits,
interruption and fail-closed database and Redis behavior. Both servers
stopped and all four loopback ports closed. No real provider, SMTP,
Stripe or Preview was used.

| Evidence | SHA-256 |
| --- | --- |
| HTTP result | `b8f7c69819abb890914137288371be3967ffcfad389493822a2496514e7049ae` |
| Build and controller result | `2df93d831b83338b0879f585102dcc0391129766d209803a1d03e55b51629d81` |

## Hosted Preview

### Healthy isolated Preview and Redis privacy on `a022a2ec`

The hosted limiter now derives a versioned HMAC identifier from the existing
server-side auth secret before sending each request bucket to Redis. This
keeps raw client IPs and application identifiers out of shared Redis keys.
The change starts fresh quotas on first deployment or secret rotation. Earlier
keys age out under the existing window. Hosted startup requires both shared
Redis credentials and the app secret.

Two new unit regressions reproduced the raw identifiers and missing-secret
admission. The fix passed 141 focused application tests and 204 audit and
orchestration tests. The exact webpack build passed 14 local hosted HTTP
checks across two Next processes and TLS PostgreSQL. The controlled Redis
transport verified only versioned pseudonymous bucket keys, a shared quota
and the existing fail-closed and recovery responses.

The protected Preview ran the exact tracked archive against the existing
synthetic Neon branch and a free disposable Upstash database. Unauthenticated
health access returned the Vercel protection redirect. Protected health
returned 200 and the anonymous workspace list returned 401. Both existing
synthetic users signed in, reopened distinct sessions with secure HTTP-only
cookies and received 403 for their canceled trial entitlements. Redis
contained two expected pseudonymous bucket keys. The controller removed them,
verified an empty Redis database, removed the Preview and confirmed 404,
then verified restoration of the eight original Preview settings. The
disposable Redis instance expires automatically on November 16. The first
attempt stopped before deployment on Vercel's environment-create response
wrapper and verified cleanup of its one setting and empty cache. No
payment, provider inference or email was invoked.

| Evidence | SHA-256 |
| --- | --- |
| Tracked archive | `497137cc6fbda01e941efab53120ebeebad4dea182a5e43b3fcf6e6112d91e62` |
| Exact local HTTP result | `daf8302e3a1e7b60e4a515da881b52b8988c56fdd3b5daa648f2b9510bc454d6` |
| Initial attempt and cleanup, 12 HTTP operations | `0091447f2c884758d4de0b8ef6708fbc4b7c9b7cbbcbb5b53a839d508970ec51` |
| Protected Preview and cleanup, 37 HTTP operations plus CLI archive submission | `e6ecf3d1339204a35d54d4bb901c45916d09b5cb0ab4847020f94d11612d80c5` |
| Exact managed checks, 12 passed | `0fa0c840ab70eb166bfae611443861c825bebde19ea39452a96a9996309a2e66` |
| Exact managed Chromium, 616 passed and five hosted-only skipped | `dcbcbe577005b6dc1abed5c32497de20c542cc5d0e6ed901745c8606d8367a19` |
| Exact managed cleanup, PostgreSQL stopped | `d90a36c17694c34785e66c7c4e5cc902d20b68e3cfbbdc2681ef570bd540c1c7` |

The full tenant workspace lifecycle and automatic Stripe retry are recorded
against the earlier source below. The healthy Preview above verifies current
auth, entitlement enforcement and shared Redis privacy only.
[Upstash ephemeral resource retention](https://upstash.com/blog/redis-database-for-agents) ·
[Vercel request headers](https://vercel.com/docs/headers/request-headers).

### Successor archive and Preview authentication

The `40c447d8` archive was verified against 5,687 tracked Git blobs.
Its counted controller received HTTP 403 on the first read-only isolated
project request and stopped before uploading the archive, deploying or
changing any environment setting. Source archive SHA-256
`59acfbd9e14a4d1e1faa9d92d2cc42f4d6f754ff78c5dfd22d4fdd2ea3d2bab0`.
Stop receipt SHA-256
`439f66ebfc758da04a6cd71f18f47f04e15cdf618c69c97dc9abc5c7fef4953d`.
[Vercel archive upload](https://vercel.com/docs/rest-api/deployments/upload-deployment-files) ·
[Vercel deployment API](https://vercel.com/docs/rest-api/deployments/create-a-new-deployment).

The CLI refreshed its existing session successfully. The second counted
run uploaded the same archive and created one protected Preview. After
the first poll the build left the expected active states without reaching
READY. The run made zero application requests. It confirmed deployment
removal by 404, restored all eight prior Preview settings and confirmed an
empty disposable Redis cache. An additional read-only build-events request
after removal returned 404, so the build cause is unverified. The retry
and cleanup used 24 requests, with one later read. The conservative ledger
is at 1,782 of 1,793. That balance cannot cover a full new build, runtime
checks and cleanup. Retry receipt SHA-256
`825db02805411a7c590adb3cbac47cb1a6051e0d505b844349e2502bf6a5e96b`.

### Actual Stripe retry and workspace isolation on `ab47d87f`

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

The separate managed macOS `e3c90730` archive passed 11 checks with
27,918 tests in unit and coverage and 87.92% branches. Chromium reported
610 passes, six failures and five hosted-only skips. The failures were
in married Pennsylvania originals and payments, passenger originals,
payment UI, official workspace upload and part-year Ohio school sources. The separate
`3d8f674a` archive also passed 11 checks with 27,921 tests in unit and
coverage and 87.92% branches. Its managed browser command stopped in the
Next build before Chromium. Build output printed a TypeScript runtime
inconsistent with the measured controller duration. The cause remains
unverified. Both managed PostgreSQL instances stopped and tracked source
pins stayed exact.

| Evidence | SHA-256 |
| --- | --- |
| `e3c90730` managed checks | `6f9e31a8870db4a1bbecae1ef22d226475077451954206fcb0cdee910cd61127` |
| `e3c90730` managed browser transcript | `a771f39b2d06f411ebc0028a64a05c4f0e95d6116ea9d5ec5d313bcf58d71eb6` |
| `3d8f674a` managed checks | `cdbf77a9e5c4b7e5d298833b0823a247b08ef68f843b0408f973cec3e196c2c8` |
| `3d8f674a` managed browser build transcript | `1d039cc775dfd4f314e5edca027472adaecd8a70f68520cfc15eec86a3fc8ed8` |

### ARM64 runner after removing Debian mount at `3ade5abe`

The archive authenticated 5,697 tracked blobs and 15 public example PDFs.
The ARM64 image built, imported in an independent store and passed smoke,
including the complete package manifest, immutable-base package removal
dry run, absence of the mount executables, and zero set-ID regular files.
All six Compose recovery phases passed. The runtime browser provenance
preflight also passed. The browser runner then rejected six mismatched
source digests before collecting Chromium cases. An offline comparison
identified exactly those six files. The successor `dc7546f9` rebinds them
and the two mail dependency files while preserving the original request
contract. The VM stopped normally, both socket routes and default
connection were verified, and no VM remained active.

Grype reported 191 matches across 86 advisory IDs, including 56 High and
zero Critical. Against the preceding exact ARM64 result the only changes
were removal of six matches attributed to the optional `mount` package,
four of them High. The same advisory IDs still match shared packages.
Advisory disposition and final-source native qualification remain open.

| Evidence | SHA-256 |
| --- | --- |
| Staged Git tree and supporting files | `6d9bf2850681b1a6a3ce2f740699c4c32fb46625440a9cadb66f941d14b72d6d` |
| Runtime image archive | `07a41bf6243b10839d4bcd48df0d2e0767befc64fa2478e29635f78d305c06ba` |
| Smoke | `53f57eca9d2e1e178ba7e664d13f6b51f18fef2d56ca5ab2ac95482bf6c6b63e` |
| SBOM | `61dedb3fddcc2faa1402ed53d8048d85921c96d40cb850320b956fabb4d35992` |
| Scan | `7394e4bd55781c5bb9881e82972fa8522eb2a99c36eaf8b4c08a73bb63f19e40` |
| Scan delta | `b9ae86c4f0543abac843f14340220fd70e25ead83e0bd8eb23897c74c0c7cbf0` |
| Compose recovery | `eea1e6aebcd2050c560786263be443c86f1b7dc0f22c22e9a381b15599e081c5` |
| Browser failure | `0e7f731f9f8856458099f061cab98f7d526d85a7951975dbda5e63941bbcbb7a` |
| Terminal receipt | `78229eb4fcb6ab98071e9762ce2c0a6778d048c036fa2912ada45c0c39f32462` |
| Runtime cleanup | `cd32053478e94fc27e16e991280a6f3de2d3580c6280dd1e44122dc93d318b40` |

### Managed verification through `ceaa6582`

The exact tracked archive passed nine managed checks. The unit command
recorded 27,940 passes and two Pennsylvania PDF timeouts at 5 seconds.
The cases were the mixed-residency readback and the married separate-filing
shared Schedule SP dispatch. The two unchanged suites passed all 34 cases
in a separate targeted run at the same deadlines. The exact managed run
did not reach coverage or Chromium. Its owned PostgreSQL stopped.

| Evidence | SHA-256 |
| --- | --- |
| Managed results | `d386facd598c2462de07ee330490131e535140ea602085a526452671ca0cdda1` |
| Unit output | `2965deb185b67ac5e0a319e92255fcb19df6ede68fe200f5c19e7298b4e8a35d` |
| Unit failures | `359eace36a9d37da1b99e51f784d46b6c6f30603dfd3363435755618ef4c4664` |
| Targeted 34 passes | `0b629e541b18b5b84a71358717e2b0ca05b53c348145da1df35c497794bdd80c` |
| Managed cleanup | `fceb5e3c3ee51d75c8b724e5e0b8090539dc718540e264b3f12f06a39717d115` |

### Form 4972 estate-allocation archive at `e3c90730`

The first preflight stopped before boot. The private archive extraction
gave the tracked public sample registry mode 0600. The retry preserved
the tracked bytes and staged that public fixture at 0644 inside the
private root. The exact ARM64 image built and imported into a separate
container store. Smoke, zero set-ID regular files, the SBOM, Grype scan
and six Compose recovery phases passed. Chromium passed 616 tests with
five hosted-only skips. The controller removed its browser container,
stopped the VM normally and verified its user socket was restored and
the root socket and default connection were unchanged. No VM remained
active. Grype reported 197 matches, including 60 high and zero critical.
Advisory disposition remains open.

| Evidence | SHA-256 |
| --- | --- |
| Image archive | `1c636879ab79ccbf68bff5b173cf0f1923d4b19c2bf20a0e2a2cb048e1097275` |
| SBOM | `181d007d2f531905c011dd2035f7f560a89d32e221913493defe354014d7c011` |
| Scan | `041538c71ac10d833ba1c6620600a4126cad725936268990740c37c77d97f4fe` |
| Compose recovery | `4a967531b0106b64dd8f2813225884df54bce652750f829658e90cc5557bf9d6` |
| Chromium | `a0a288f64631d7b381931e67799faffcc8e952d5a7d6c71d2dbf2f3e32dc2213` |
| Terminal receipt | `f4d95bcec4a731c385e7c2f9eed034502e744868a16f5e7597fe10a69e039a2f` |
| Cleanup | `cd32053478e94fc27e16e991280a6f3de2d3580c6280dd1e44122dc93d318b40` |

### App and annuity archive at `e6a34ac3`

The source archive matched all 5,687 tracked blobs and 15 supplemental
sample PDFs. The separate runtime store imported the exact ARM64 image,
with zero set-ID regular files at smoke. The prior image, upgrade, database
restart, dump and restore, rollback and re-upgrade all passed. Chromium
passed 616 cases with five hosted-only skips. The VM stopped normally.
Cleanup restored the user socket route and verified the original root
route and default connection. Grype recorded 197 matches across 86 Debian
advisories. It reported 60 High matches, zero Critical and no available
fix in that scan. Security-owner disposition remains open.

| ARM64 evidence | SHA-256 |
| --- | --- |
| Source archive | `b4f4d4d14c379c2e2d3651df06c06e34fd99d095384af40879e036f677e48e9e` |
| Runtime image ID | `8657b96327e45811973ccefe375b9ace67fd48e7f21138f5417817354c0be8f0` |
| Runtime image archive | `5f1727e291ff7e6ac2266b3e2a2abf2f4dc902e739373eaf8dc095d42f1d1372` |
| CycloneDX SBOM | `fa964099818175b2e07b8a70e063264b1292d52573e56ea76edd72a3536f75af` |
| Grype scan | `50ba66a19ec8cbdc2bf91c5ba0a5dc2756bbd38f6fb5d01032660a7c918c6fc1` |
| Compose recovery | `fffacc42da1e926725ccd9d0dcfe2cdadf04c8847a4e5687c446add2d4ddab76` |
| Chromium transcript | `90f82abdeff0b96fd2a591bf680ab037581e0e9fdda5b68e4ce32bcf53c4288c` |
| Complete rehearsal receipt | `100a898014c8ef8b4386e7e79f275809e703bb8c1994edbc6638062b0ba99ee2` |
| Normal stop and socket restoration | `cd32053478e94fc27e16e991280a6f3de2d3580c6280dd1e44122dc93d318b40` |

### Set-ID hardening and retirement worksheet archive at `4593c4ec`

The separately imported runtime passed smoke with zero set-ID regular files.
The exact SBOM and Grype scan reported 197 matches, including 60 High and
zero Critical. All six Compose recovery phases passed. Chromium stopped
before collection when source extraction left its staging root at mode
0755. Normal VM stop and socket restoration passed. The corrective run on
`ef86f0cb` uses the same permission floor and stages its source at mode
0700. Advisory disposition remains open.

| ARM64 evidence | SHA-256 |
| --- | --- |
| Runtime image ID | `4be3c1cf780f733624e80b64553de54fa9f24dcc93a962d23ef4eb2779d5d564` |
| Runtime image archive | `59b9c9e5a7883f48ab1ca2d28646fef98db0d2568b13ed159b0a017cfc4be6b7` |
| Smoke | `325818c6952e19f24f19610e277e994962e9f2b57ba9102273e31e1e3b88a3eb` |
| CycloneDX SBOM | `f7290d6cea6777680fd8110f00d279062acd6866a815ac10f39467bcb97bf3f3` |
| Grype scan | `21569762dce01d598ed98df8d53b3cd68b93959b82087c829e52c237f254b0ba` |
| Compose recovery | `49426f76f1c8325b1f09968d0d09a60bb9de9f4844fb7feac0f86a65b839f8bc` |
| Rehearsal and cleanup | `7570bd038ab3a9a7ddaa3788323836a1047add8e4575a20ec572988f37b70ab0` |

### Corrected private staging on `ef86f0cb`

The separately imported runtime passed smoke with zero set-ID regular
files. It passed six Compose recovery phases, private browser admission
and 616 Chromium cases with five hosted-only skips. Normal stop and user
socket restoration passed. The scan still reports 197 matches, including
60 High and zero Critical. The scan result does not record risk acceptance.
The exact managed run on the same archive exposed a stale browser diagnostic
digest and two abbreviated parameterized spec references. The failure is
retained, and the successor `e6a34ac3` passes both affected checks.

| ARM64 evidence | SHA-256 |
| --- | --- |
| Runtime image ID | `b19f390e623e0cb3a3682afe3ffb8c60150e724bb4ca76aeb44250f0e7c472d9` |
| Runtime image archive | `27bad15ce9870c6ce1d006997d1237335f6ab43b0579269551682669e05f256d` |
| CycloneDX SBOM | `41b911c6a8d02a244f686e1002b4f902b7f842be637d45392fde0d74c73c0db1` |
| Grype scan | `23e22d1fffff61982fd04c352494eacf0f8eaf2e47ee3877ed0b353c26226d37` |
| Compose recovery | `4593f90f5dae22887f098190ae2273c36e4c0bed45b25adef617ef68970a5115` |
| Chromium transcript | `2ed4e8db8d3da287d56e445a6e7939e161b83bf004138de3f265607be852ea01` |
| Complete rehearsal receipt | `36cb9f4db5d940c75618153af2b2bb2208a03ff59658f3f0419fe0fc2a1c2dce` |
| Normal stop and socket restoration | `cd32053478e94fc27e16e991280a6f3de2d3580c6280dd1e44122dc93d318b40` |

### Redis pseudonym archive at `a022a2ec`

The native image passed separate image-store import, smoke, SBOM and Grype
scanning, all six Compose recovery phases and 616 of 621 Chromium cases.
The other five cases were hosted-only skips. The isolated VM stopped normally,
the user socket route was restored, and the root route and default connection
were verified unchanged. The scan records 197 matches, including 60 High.
The advisory disposition remains open.

| ARM64 evidence | SHA-256 |
| --- | --- |
| Runtime image ID | `cd661e83c7becfcc08bae4a75c9bbe63997bdc93de5eb99c15662ff5bc6a2b0c` |
| Runtime image archive | `a9c1e22a411ebefaaae974c38e2e332f20f13e7399d462e576993a9baa1d2ee2` |
| CycloneDX SBOM | `d011edd3582fffaa7a69cb81a10a791f477a2571dd58d31ef0e936ea6290ccfc` |
| Grype scan | `3503f3ce019c2a6307005b916ac28318bab459107198d4f77f0c38fc9798c41f` |
| Compose recovery | `53cb54392e975f67b0f131f49326c7a767b7cb53503c2a0fefc158fb604d028d` |
| Chromium transcript | `382d833804976a2104d20bd7b22a5fff4f4f0f74ac516c436a0c2772fb460424` |
| Complete rehearsal receipt | `a4b77174c50b7ab448e08cfc5dd445219619ed460df87256b323a3e704874c44` |
| Normal stop and socket restoration | `cd32053478e94fc27e16e991280a6f3de2d3580c6280dd1e44122dc93d318b40` |

### Pennsylvania death-date guard archive at `0fb0c9a5`

The runtime passed separate image import, smoke, SBOM and scanning,
all six Compose recovery phases and 616 Chromium cases out of 621
collected. The five hosted-only skips remain. The isolated VM stopped
normally and the user socket route was restored. The Grype scan records
197 matches across 86 advisories. No risk disposition was recorded.

| ARM64 evidence | SHA-256 |
| --- | --- |
| Runtime image ID | `fd81a0a27f4539fe70c5a39d3b9696ff918212b8fdb8f748c2e3c289e1221b48` |
| Runtime image archive | `caac8493fb5b4c370f1dd380d967ede2276dcd8ef40ff432f64784aca52a910a` |
| CycloneDX SBOM | `deb7dcb2cf6f6643161fe25908a0833afe3c3a1a108f4963dce9b6de962abb6c` |
| Grype scan | `b01dc05da75b0570d0d84c707ca32c9e8b56c67b5a82b65b3ecb571b6bf39166` |
| Compose recovery | `943db2641ad3d1ac3287bd369989b90324046fdc30a919e9dee1abb29c0ed8c1` |
| Chromium transcript | `384071aba1867a418d4d82acd1da76c9db2b6a8581f9d96e2fe63bdaa00d4d68` |
| Complete rehearsal receipt | `7dbd47b04d633fa0cc56f26ab1034b0485e4e594268ee5ec6d8bcc262bcda0e2` |
| Normal stop and socket restoration | `cd32053478e94fc27e16e991280a6f3de2d3580c6280dd1e44122dc93d318b40` |

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
