# Account recovery SMTP dependency

On October 25, 2026, add pinned `nodemailer` 10.2.1 and
`@types/nodemailer` 8.0.2 to the web workspace for hosted password recovery.
The registry's published versions, integrity hashes and Node requirement
(Nodemailer requires Node >=20) were checked before generating the lockfile.
The project uses Node 24.22.1. The lockfile delta contains only these two
packages; existing runtime versions and required compiler/math/PDF pins remain.

Validation: isolated lockfile generation and the installed checkout both pass
`pnpm install --frozen-lockfile --ignore-scripts --strict-peer-dependencies`
(the isolated generation uses `--lockfile-only`). The installed lockfile's
`pnpm audit --json` reports zero advisories across 521 dependencies. An offline
stream-transport check constructs a synthetic message without opening a network
connection. Logs are `.local/upgrade-evidence/smtp-dependency-install.log` and
`smtp-installed-audit.json`; the isolated resolution is in
`smtp-dependency-lock.log`. This establishes dependency evidence only. Delivery,
application recovery and staging qualification are separate checks.

Sources: [Nodemailer SMTP documentation](https://nodemailer.com/smtp),
[published package metadata](https://registry.npmjs.org/nodemailer/10.2.1), and
[published TypeScript declarations](https://registry.npmjs.org/@types/nodemailer/8.0.2).
