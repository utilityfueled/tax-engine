# Next 16.4.5 security update — November 3, 2026

Next and its ESLint plugin advance from16.4.4 to16.4.5. The lock changes only those Next-family versions, their peer contexts and11 integrity values. Independent normalization restores the exact prior lock bytes. TypeScript5.9.3, Decimal10.6.0, pdf-lib1.17.1, Sentry10.76.2, webpack and aliases remain unchanged. Frozen installation passes with scripts disabled. Parent application base is82e97db70267bce3e9459c7c09655148fdbd9a04; the preceding reciprocal browserb45cda6c and PA married browser82e97db7 packages are pushed separately.

## Official sources and unresolved metadata

Earlier root retrieval of the [published release notice](https://nextjs.org/blog/november-2026-security-release) and [updated advance notice](https://nextjs.org/blog/upcoming-nextjs-security-release-november-2026) observed16.4.5/15.5.29 recommendations. Subsequent root and peer retrieval of the release page returns Internal Error; the peer cannot independently re-fetch that recommendation. Cached releases and the old pre-release HTML are not substituted. The root-retained19:17 UTC GitHub advisory API metadata and independently readable advisory pages remain explicit primary evidence.

The release notice calls the first issue High; contemporaneous advisory metadata says Medium. Several affected ranges are unbounded with no patched version; one specifies patched16.4.2 while retaining an affected range including16.4.5. These conflicts remain open. A fresh registry audit reports zero vulnerabilities across522 dependencies; that result does not establish all seven fixes.

All seven rows below have the same assigned follow-up owner, **Codex upgrade execution (this active goal)**, and recheck expiry **2026-11-04T19:30:00Z or before any release/staging qualification, whichever occurs first**. This assignment covers investigation and fresh evidence, not risk acceptance. No qualified human security review or release qualification is asserted.

| Primary advisory | Contemporaneous16.x affected range / patched field | Bounded application exposure and remaining action |
|---|---|---|
| [GHSA-mfr8-8qww-v76h](https://github.com/vercel/next.js/security/advisories/GHSA-mfr8-8qww-v76h) | >= 16.3.0 / (empty) | No application use-cache/unstable_cache or Cache Components opt-in found. Installed default false. Unbounded metadata and severity conflict remain open. |
| [GHSA-vc7v-qv4w-wrv8](https://github.com/vercel/next.js/security/advisories/GHSA-vc7v-qv4w-wrv8) | >= 16.2.0 / 16.4.2 | No nested use-cache/rootparam feature use or Cache Components opt-in found. Contradictory patched/affected fields require refresh. |
| [GHSA-rhh4-g77r-r9qj](https://github.com/vercel/next.js/security/advisories/GHSA-rhh4-g77r-r9qj) | >= 16.0.0, <= 16.4.2 / (empty) | No use-cache binary inputs or Cache Components opt-in found. Bounded affected range excludes16.4.5; empty patched field remains recorded. |
| [GHSA-pc58-hwjq-p385](https://github.com/vercel/next.js/security/advisories/GHSA-pc58-hwjq-p385) | >= 16.0.0 / (empty); < 16.0.0 / (empty) | Inspected providers parse bounded upstream bodies and construct new JSON. Sentry /monitoring generates external rewrites through Next httpxy proxyRequest, distinct from the advisory fetched-Response path. External proxy/runtime framing remains unverified; no general proxy-safety claim. |
| [GHSA-f3mh-rxg3-f5g2](https://github.com/vercel/next.js/security/advisories/GHSA-f3mh-rxg3-f5g2) | >= 16.0.0, <= 16.4.2 / (empty); >= 15.0.0, <= 15.5.28 / (empty) | Bounded range excludes16.4.5. Explicit Edge image route is static; middleware does not set cookies and auth handlers use default Node. No sensitive Edge cookie prerequisite found; runtime review still required. |
| [GHSA-7qx7-33qx-rqx2](https://github.com/vercel/next.js/security/advisories/GHSA-7qx7-33qx-rqx2) | >= 16.0.0, <= 16.4.2 / (empty); >= 15.0.0, <= 15.5.28 / (empty) | Bounded range excludes16.4.5. All inspected next/image inputs are local PNG and remotePatterns defaults empty. Arbitrary optimizer endpoint/external rewrite behavior was not exercised. |
| [GHSA-vvgp-ww4w-46vf](https://github.com/vercel/next.js/security/advisories/GHSA-vvgp-ww4w-46vf) | >= 16.4.0 / (empty) | Cache Components disabled; required shared fallback cache feature not found. Unbounded metadata remains open. |

## Actual checks and review

- Frozen install/registry integrity checks pass; new lock SHA256 `d199e2344fa6cf61402330f216e3f7ccf6bc9b5e7a568670b29a9fe27dc8c23f`.
-480 affected security/Compose controls across14files pass. All three typechecks, root/web builds and lint pass. Lint reports0errors and11716warnings; warnings are retained, not suppressed.
- Normal managed production-browser runs pass28/28 selected self-host flows, account recovery, help and workspace-year cases, retries0/skipped0/unexpected0/flaky0. The managed server closes; root checks no3099 listener remains.
- Distinct static review approves the exact three dependency files and confirms eleven integrity changes/no other lock drift. It retains source-fetch limits, all seven advisory discrepancies and Sentry proxy caveat. It is agent review, not qualified human approval.

Durable local evidence under `.local/upgrade-evidence/`: `nov03-next-1645-security-metadata/checks.json`, `nov03-next-1645-security/lock-scope-proof-before-main.json`, `nov03-next-1645-security-main-install/checks.json`, `nov03-next-1645-security-main-static/checks.json`, `nov03-next-1645-security-main-browser/checks.json`, `nov03-next-1645-security-independent-review/receipt.json` and `nov03-next-1645-security/owned-exposure-and-checks.json`. Security-test log SHA256 `2b1747026cf8e5387bd7d9d5365dd95583c839970655d5b295d513afae679685`; production browser log `af51869d980907c8863d8609f0a113aa260a5b97489483eb49573468cc7e5814`.

Full current-suite/coverage, target runtime images/SBOM/advisories, external reverse-proxy behavior, staging billing/outages/tenant tests and qualified human security/privacy review remain required. Historical18:09 audit and16.4.4 source observations remain historical; this successor does not relabel them. No production deployment, image publication, funding, filing, model promotion or readiness gate changed.

Successor independent receipt SHA256 `7d07a1b2ae57bf91ca0d8c41e8324f70a57cec192c306788e90544082ae703de` verifies all seven owner/deadline rows and current480/28 runtime evidence, preserving original receipt `257b1d80f0e71bee37fb3f819394d11b4a676b49a678f56f9dca66cf45030b22`.

## Later November 3 primary-source refresh

The official [16.4.5 release](https://github.com/vercel/next.js/releases/tag/v16.4.5) is now independently readable and lists fixes for all seven exact advisory IDs above. The [updated advance notice](https://nextjs.org/blog/upcoming-nextjs-security-release-november-2026) also identifies 16.4.5 and 15.5.29 as available. Root separately retrieved both pages after the independent refresh. The branch already declares and installs 16.4.5; no dependency change follows from these results. This resolves the earlier inability to retrieve the producer recommendation.

The seven advisory pages still contain the recorded affected-range/patched-field conflicts. They remain open under Codex upgrade execution, with the existing November 4 19:30 UTC recheck or before any release/staging qualification, whichever comes first. The release assertion does not correct those machine-readable fields or constitute risk acceptance. Static inspection of 392 application files retains the existing cache-feature and Sentry external-proxy limits. No new package audit, registry integrity check, runtime proxy test or scan was executed for this documentation refresh.

Independent source-bound receipt: `.local/upgrade-evidence/nov03-next-1645-security-independent-refresh/independent-refresh-result.json`, SHA256 `1569c11d5cb7ce807937351a3537a4ead9de08fedc90c739c4971edd858e49d1`, bound to `3a47565931609ef921080c18b5167063dee12681`. Earlier fetch failures and metadata conflicts remain retained. Current-source native ARM64/AMD64 image/SBOM/scan/recovery evidence, all 80 image-advisory owner decisions and independent human security/privacy review remain required. No release gate or acceptance changed.
