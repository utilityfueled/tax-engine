# Remote backup of the local upgrade commits

At the user’s November 14 request, all 390 commits ahead of `origin/main`
were pushed without force to
[`codex/2026-upgrade-backup-20261114`](https://github.com/utilityfueled/tax-engine/tree/codex/2026-upgrade-backup-20261114).
A subsequent remote query returned exact local head
`d9ead6be052b7823de5e0e80bb7f463b68d706b2`. The push exited zero.
Only committed tracked files were included; unrelated untracked `.pnpm-store/`
and `docs/reviews/` remain local.

Remote `main` was not updated. Fresh Vercel navigation still shows the connected
repository, production tracking `main`, automatic custom-domain assignment,
Automatic build behavior and no deployment checks. The earlier production hold
therefore remains effective for remote main. The pending user decision is whether
to disable automatic production builds before updating main, or retain the backup
branch while leaving those settings unchanged. No production setting or deployment
was changed by this backup action.

The CI and Web push triggers include only main and the old upgrade branch. This
backup push does not establish a remote CI result. Both workflows support an
explicit dispatch; final exact-source remote verification remains required.
Independent file-only review confirms that their existing dispatch paths build,
test and retain artifacts without publishing images or deploying production.

Private evidence: `.local/upgrade-evidence/nov15-main-backup-push/RECEIPT.json`.
The active full-suite/AI correction, consolidated metadata and runtime work continue;
a successful backup is not upgrade completion or release qualification.
