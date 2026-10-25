# Legacy hosted metadata cleanup and recovery

The browser and PostgreSQL store now allowlist workspace metadata. Existing rows
and older backups can still contain fields written by earlier versions. Reading
through the new store hides those fields but does not erase them from storage.

The explicit migration removes unapproved fields from `hosted_workspace_shells`.
It preserves owner/workspace identity, database timestamps and unknown tax years.
It defaults to a dry run, commits all selected rows atomically, and aborts on
invalid metadata or identity mismatch. It refuses more than 1,000 rows by default
(operator-selected maximum 10,000) or more than 64 MiB of JSON. Larger datasets
need a separately reviewed batched procedure. Reports contain counts only.

## Operator procedure

Use a staging clone first. Production execution requires the service owner's
authorization and approved backup/retention handling; this development rehearsal
does not grant either. Stop legacy writers and restrict access during restoration.

1. Record the application commit, database version and approved maintenance
   scope. Back up the database with the operator's normal encrypted, access-limited
   backup procedure and verify a restore into an isolated target.
2. Supply `TAX_ENGINE_METADATA_MIGRATION_DATABASE_URL` through the secret manager.
   The command deliberately does not consume ordinary `DATABASE_URL`. Do not put
   credentials in command arguments or copied logs.
3. From the repository with Node 24 and the frozen dependencies installed, run:

   ```sh
   pnpm exec tsx --tsconfig apps/web/tsconfig.json scripts/migrate-hosted-metadata.ts
   ```

   Inspect the count-only report and privately resolve any invalid legacy rows.
   A failure must not be resolved by discarding a user's identity or guessing a year.
4. After backup verification and the required operational authorization, run:

   ```sh
   pnpm exec tsx --tsconfig apps/web/tsconfig.json scripts/migrate-hosted-metadata.ts --apply
   ```

   `--maximum-rows=2000` can explicitly raise the bound when the reviewed scope
   requires it. A failed connection around commit has an uncertain outcome: run a
   fresh dry run before retrying. Never infer rollback from a disconnected client.
5. Run another dry run; `changed` must be zero. Verify tenant-bound read/list/save/
   delete through the current application. Retain only count/status evidence in
   normal logs. Coordinate old backup/WAL/object-store retention separately:
   sanitizing active rows does not remove historical copies.

Rollback restores the verified backup in isolation. An old backup reintroduces
legacy private fields, so reapply this cleanup before enabling user traffic.
Restore billing events, purchases, reservations and attempts together; mixing
ledger generations can duplicate spending or erase reconciliation state.
Server backup restoration cannot restore browser-only tax facts or original
documents. Users need the separate encrypted local backup for those records.

## Local executable rehearsal

The script requires an explicitly disposable loopback PostgreSQL database with
role `ai_test`; it rejects remote hosts and ordinary application configuration.
It creates a fresh random schema and removes only that schema and its temporary
archive. Set `TAX_ENGINE_TEST_AI_LEDGER_DATABASE_URL` to that disposable instance
and, if needed, `TAX_ENGINE_TEST_POSTGRES_BIN` to the directory containing matching
`pg_dump` and `pg_restore` executables, then run:

```sh
pnpm exec tsx --tsconfig apps/web/tsconfig.json scripts/rehearse-hosted-recovery.ts
```

The 2026-10-25 local PostgreSQL 16 run passed: nine real application tables,
two owners sharing a workspace ID, dry-run nonmutation, atomic cleanup, actual
custom-format `pg_dump`/`pg_restore`, exact `0.0000006` provider cost, preserved
billing/purchase/reservation records, and idempotent cleanup after restoration.
The whole restored table contents matched the pre-backup snapshot. Temporary
files were removed. Fourteen focused migration/store tests and web typecheck
also pass. Evidence: `.local/upgrade-evidence/hosted-pg-dump-restore.log` and
`metadata-migration-postgres.log`.

This is local synthetic database evidence. Hosted auth tables/sessions, external
object storage, Redis, real Stripe/provider services, staging availability and
target-platform release rollback remain separate required rehearsals.
