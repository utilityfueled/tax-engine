import { parseArgs } from "node:util";
import { inspectHostedAiCreditConflict } from "../apps/web/src/lib/hosted-ai-credit-conflict";
import { getHostedServerDatabase } from "../apps/web/src/lib/hosted-server-db";

async function main() {
  const { values } = parseArgs({ options: { mode: { type: "string" } }, strict: true, allowPositionals: false });
  const mode = values.mode;
  const databaseUrl = process.env.TAX_ENGINE_CREDIT_CONFLICT_READONLY_DATABASE_URL?.trim();
  if ((mode !== "test" && mode !== "live") || !databaseUrl || process.stdin.isTTY) throw new Error("Missing input.");

  const chunks: Buffer[] = [];
  let bytes = 0;
  for await (const chunk of process.stdin) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    bytes += buffer.length;
    if (bytes > 256 * 1024) throw new Error("Evidence exceeds the size limit.");
    chunks.push(buffer);
  }
  const packet: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  const { pool, db } = await getHostedServerDatabase({
    TAX_ENGINE_DEPLOYMENT_MODE: "hosted", NODE_ENV: "production", DATABASE_URL: databaseUrl,
  });
  const report = await inspectHostedAiCreditConflict(pool, mode, packet).finally(() => db.destroy());
  console.log(JSON.stringify(report));
}

main().catch(() => {
  console.error("Paid Checkout inspection failed. Check the selected mode, the read-only connection and the private evidence packet.");
  process.exitCode = 1;
});
