# November2 Next maintenance update

- [x] Upgrade Next and its matching ESLint plugin16.4.3→16.4.4, retaining the exact lockfile. Exactly11 Next-family entries change;507 other package entries remain identical.
- [x] Independent static/source review verifies every updated public npm integrity, peer compatibility,4290 unrelated regular source files and six literal symlink targets. Receipt `08fa940f53bfb8da523664427ce53a758ba27fa16c844dff0635e143147492ac`.
- [x] Parent main: frozen offline installation with strict peers,123 controls/eight files, three type checks, engine build, web webpack build and scoped lint/diff all pass. Initial noninteractive installation abort is retained separately; rerun uses normal `CI=true` installation handling. No test was changed in this dependency package.
- [x] Fresh actual main `pnpm audit --json` and production audit pass with zero reported advisories across522 and426 dependencies respectively.
- [ ] Recheck the announced November3 security release against exact affected versions and published advisory IDs; apply and verify the actual fix separately.

[Official16.4.4 release](https://github.com/vercel/next.js/releases/tag/v16.4.4) is a bug-fix backport. It does not establish remediation for the seven medium issues in the [November security announcement](https://nextjs.org/blog/upcoming-nextjs-security-release-november-2026). A zero current registry audit does not close that future advisory gate.

TypeScript5.9.3, Decimal10.6.0, pdf-lib1.17.1, Sentry10.76.2, Node24.22.1, pnpm10.34.8, webpack and aliases remain unchanged. Sentry11 is not migrated.

Author focused evidence was121pass/one known public API fixture failure; its unchanged16.4.3 baseline reproduced the same failure. That actual reciprocal-source fixture was corrected independently in pushed `e3f7fd95`, retaining all monetary assertions and the exact old NJ input as a rejection control. With that separate commit, parent main now passes123/eight.

Evidence under ignored `.local/upgrade-evidence/`: `nov02-next-1644-refresh/`, `nov02-next-1644-independent/`, `nov02-parent-next-1644-main/`, `nov02-parent-next-1644-main-ci-green/checks.json`, and `nov02-parent-next-1644-main-audits/checks.json`. Exact reviewed source copies and hashes are retained. These are bounded local checks; final full-suite/coverage/browser/runtime/advisory and actual staging qualification remain required. No deployment, production change, model promotion or filing readiness is established.

November3UTC refresh at44e752d0 again reports zero registry advisories for522
full/426 production dependencies. The official announcement still describes a
forthcoming release; maintainer advisories show no November3 fix yet. The
[separate Sentry11 review](upgrade-2026-sentry11-review.md) retains10.76.2 with
an explicit privacy rationale and follow-up date. No dependency changed here.
