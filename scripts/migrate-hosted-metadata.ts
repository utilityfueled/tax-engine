import { parseArgs } from "node:util";
import { getHostedServerDatabase } from "../apps/web/src/lib/hosted-server-db";
import { migrateHostedWorkspaceMetadata } from "../apps/web/src/lib/hosted-workspace-metadata-migration";

// Explicit operator command. Ordinary application startup never runs this.
async function main() {
  const { values } = parseArgs({ options: {
    apply: { type: "boolean", default: false },
    "maximum-rows": { type: "string", default: "1000" },
  }, strict: true, allowPositionals: false });
  const databaseUrl = process.env.TAX_ENGINE_METADATA_MIGRATION_DATABASE_URL?.trim();
  if (!databaseUrl) throw new Error("Set the dedicated metadata migration database URL through your secret manager.");
  const maximumRows = Number(values["maximum-rows"]);
  const { pool, db } = await getHostedServerDatabase({
    TAX_ENGINE_DEPLOYMENT_MODE: "hosted", NODE_ENV: "production", DATABASE_URL: databaseUrl,
  });
  try {
    const report = await migrateHostedWorkspaceMetadata(pool, { apply: values.apply, maximumRows });
    console.log(JSON.stringify(report));
  } finally {
    await db.destroy();
  }
}

main().catch(() => {
  // Never print connection strings, upstream errors or private metadata.
  console.error("Metadata migration did not finish successfully. Check the private operator runbook; if apply was requested, run a fresh dry run before retrying.");
  process.exitCode = 1;
});
