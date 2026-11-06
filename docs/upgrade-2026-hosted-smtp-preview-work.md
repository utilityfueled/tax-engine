# Preview SMTP configuration evidence

The user created the Zoho app password and saved it directly in Vercel. A fresh browser metadata check confirms `TAX_ENGINE_AUTH_SMTP_PASSWORD` is a Secret environment variable with Preview as its sole displayed environment. Its value was never revealed, copied or written to repository evidence. Production configuration was not changed.

The four existing nonsecret SMTP settings also display Preview only: `TAX_ENGINE_AUTH_SMTP_HOST`, `TAX_ENGINE_AUTH_SMTP_PORT`, `TAX_ENGINE_AUTH_SMTP_USER` and `TAX_ENGINE_AUTH_MAIL_FROM`. Their configured values were verified separately during setup; this observation did not reveal them again. The existing sender alias is not evidence of successful SMTP authentication or message delivery.

Metadata-only private receipt: `.local/upgrade-evidence/nov02-parent-hosted-smtp/saved-secret-metadata.json`, SHA256 `820180fa83b4f9525eb9119da130bf2888c95c9dae03bd57283443f5da1a8829`, recorded `2026-11-03T01:26:30.197536+00:00`. The earlier refresh rejection protected a potentially unsaved entry. The user later explicitly confirmed saving it, permitting this refresh without discarding work.

Commit `90f7b6d1` triggered new Preview `dpl_5B9y47CwMdnjdp1CSJssxVUMXL7J` after the secret was saved; that deployment was BUILDING at the first read. Existing builds do not establish use of subsequently saved environment settings. Actual delivery, account recovery, persistence/isolation, rate limiting, outages and remaining hosted billing/security/recovery criteria must still be exercised. No production deployment or hosted-readiness qualification is claimed.
