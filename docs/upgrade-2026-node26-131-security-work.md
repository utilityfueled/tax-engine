# November 12 runtime security refresh

The November 11 Node release fixes several high-severity HTTP/2 and TLS issues,
including remote process crashes, and upgrades the bundled Undici to 8.12.4.
Development, CI and both Docker stages now use Node 26.13.1. Both package roots
require at least 26.13.1 within the Node 26 line. Hosted platform configuration
selects the major version. A protected hosted build and its runtime must report
their actual versions before qualification. [Node security bulletin](https://nodejs.org/en/blog/vulnerability/november-2026-security-releases)
and [26.13.1 release](https://nodejs.org/en/blog/release/v26.13.1).

Docker Hub returned and verified the official multi-platform index
`sha256:e6bedef217677b276c591795e169840edd9096dbf13f29df8ef8d1856b8820bc`.
The AMD64 and ARM64 manifest digests are respectively
`sha256:a5a5adfee3013de54504e0e6aff49993acf7daed072e86be75b8818c0f6ac258` and
`sha256:f97629c56128784f159ec8259ff5a85afe01064e6aa91adb1d54428bb6cce9d7`.
The index, platform manifests, configurations and layers matched their
descriptors. Both official image configurations declare Node 26.13.1. Both
image package databases retain `libatomic1` 14.2.0-19 and apt 3.0.4. The
container smoke test still checks the exact base layers, two-package APT
purge, package metadata, non-root runtime and absence of provider keys.
[Docker Official Image recipe](https://github.com/nodejs/docker-node/blob/1274f3ee37d4d0e59d308ea25b83d9e21e4db862/26/trixie-slim/Dockerfile).

## Local verification

The revised spec and existing source-contract tests were saved first. They
produced five old-pin failures and two passes on 26.13.0 before the source
change. The checksum-verified official Apple Silicon binary reported Node
26.13.1, Undici 8.12.4, llhttp 9.4.4 and SQLite 3.54.1. The seven source
controls, 140 existing hosted-adjacent tests and 36 upload controls pass on
that binary. All three TypeScript checks, 8,673 spec references, strict lint
of the changed script and test, and the smoke script's syntax check pass.
The first inventory check detected the expected stale source reference
after the spec change. Regeneration changed only the Node source reference,
and the inventory check passed. The pnpm lock remains byte-identical at
`268026058217dd84aee4e9b1c691fa1bac7d3049e6cb68d7fd16ef3af7a76dea`.

## Other advisory results

- Fresh pnpm production and full audits on that lock both exit zero, with
  447 and 539 dependency entries respectively. The seven November 3 Next.js
  advisory API records now place the patched 16.4.5 version outside the affected
  range. The API still rates GHSA-mfr8-8qww-v76h Medium, while the producer
  bulletin rates it High. The producer bulletin still omits a literal
  GHSA-vvgp-ww4w-46vf identifier and the repository release lists it. Next
  16.4.6 is the current stable bugfix release. The installed 16.4.5 addresses
  the seven reviewed vulnerabilities and stays pinned for this Node package.
  [Next.js bulletin](https://nextjs.org/blog/november-2026-security-release),
  [advisory index](https://github.com/vercel/next.js/security/advisories)
  and [16.4.6 release](https://github.com/vercel/next.js/releases/tag/v16.4.6).
- PostgreSQL 16.16 ships security fixes and identifies affected indexes that
  may require repair. Docker Hub's `postgres:16-bookworm` and
  `postgres:16.16-bookworm` returned the same index
  `sha256:a49f7438ba03589f9b1ca062f2da82e899b48ea1dc50d2449fa09a70be83ebca`.
  The verified AMD64 and ARM64 configurations report PostgreSQL package
  `16.16-1.pgdg12+1`. The release rehearsal must pull the current tag and
  record the running server and backup utility versions. Existing
  installations need the release notes' applicable migration checks.
  [PostgreSQL security announcement](https://www.postgresql.org/about/news/postgresql-187-1712-1616-1520-1425-and-19-rc-2-released-3442/)
  and [16.16 release notes](https://www.postgresql.org/docs/release/16.16/).
- A fresh Debian source comparison covers all 81 prior image advisories.
  Debian reports 78 open and supplies a fix for CVE-2026-27171,
  CVE-2026-76844 and CVE-2026-85091 in
  `zlib1g` version `1:1.3.dfsg+really1.3.1-1+deb13u1`. Both official
  26.13.1 bases still carry `1:1.3.dfsg+really1.3.1-1+b1`. Remediation
  requires a separate image change and verification. Existing owner review
  deadlines remain elapsed and all historical dispositions are preserved.
  [Debian DSA-6613-1](https://security-tracker.debian.org/tracker/DSA-6613-1)
  and [prior image register](upgrade-2026-image-advisories-20261106.json).

Exact public responses, package records, commands and output hashes are
retained in `.local/upgrade-evidence/nov12-runtime-security-refresh/`.
Fresh package audits and Docker base-layer inspection leave the composed
application image and hosted runtime untested. Both target image builds,
full browser and recovery checks, refreshed image scans and accountable
security disposition remain required for release.
