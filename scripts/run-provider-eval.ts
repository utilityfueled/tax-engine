import { readFile, writeFile, rename, mkdir } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { createProviderEvalPlan, executeProviderEval, providerEvalDigest, reconcileProviderEvalAttempt,
  summarizeProviderEvalJournal, validatePlan, validateProviderEvalJournal } from "./lib/provider-eval-runner";
import { createLiveProviderEvalTransport } from "./lib/provider-eval-transport";
import { openProviderEvalJournal } from "./lib/provider-eval-journal";
import { requireDistinctProviderEvalPaths } from "./lib/provider-eval-paths";
import type { ProviderEvalFixture } from "../packages/engine/src/provider-eval-fixtures";
const args = process.argv.slice(2); const command = args.shift();
const known = new Set(["run-id", "purpose", "profiles", "fixtures", "max-usd", "max-requests", "expires-at", "plan", "approval-template", "approval", "journal", "output", "reviewed-fixtures", "live-authorized", "attempt", "usage", "reference"]);
const options = new Map<string, string>();
for (const arg of args) {
  const match = /^--([a-z-]+)(?:=(.*))?$/.exec(arg);
  if (!match || !known.has(match[1]) || options.has(match[1]) || (match[1] !== "live-authorized" && !match[2])) throw new Error("Unknown, duplicate or incomplete evaluation option.");
  options.set(match[1], match[2] ?? "true");
}
function required(key: string) { const value = options.get(key); if (!value) throw new Error(`Required option: --${key}=value`); return value; }
async function json(file: string) {
  try { const text = await readFile(path.resolve(file), "utf8");
    if (Buffer.byteLength(text) > 16 * 1024 * 1024) throw new Error("Metadata size limit.");
    return JSON.parse(text) as unknown; }
  catch { throw new Error("Evaluation JSON input is missing or invalid."); }
}
async function privateWrite(file: string, value: unknown, exclusive = false) {
  const target = path.resolve(file); await mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
  if (exclusive) return writeFile(target, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600, flag: "wx" });
  const temporary = `${target}.${randomUUID()}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600, flag: "wx" }); await rename(temporary, target);
}
async function reviewed(): Promise<ProviderEvalFixture[] | undefined> {
  const file = options.get("reviewed-fixtures"); if (!file) return undefined;
  const value = await json(file);
  if (!value || typeof value !== "object" || !("fixtures" in value) || !Array.isArray(value.fixtures)) throw new Error("Reviewed corpus file must contain frozen fixtures.");
  return value.fixtures as ProviderEvalFixture[];
}
try {
  await requireDistinctProviderEvalPaths(["plan", "approval-template", "approval", "journal", "output", "usage", "reviewed-fixtures"]
    .flatMap(key => options.has(key) ? [required(key)] : []), options.get("journal"));
  if (command === "plan") {
    const planFile = required("plan"); const approvalFile = required("approval-template");
    const purpose = required("purpose"); if (!["capability", "smoke", "qualification"].includes(purpose)) throw new Error("Unknown evaluation purpose.");
    const plan = createProviderEvalPlan({ runId: required("run-id"), purpose: purpose as "capability" | "smoke" | "qualification",
      profileIds: required("profiles").split(","), ...(options.has("fixtures") ? { fixtureIds: required("fixtures").split(",") } : {}),
      maximumProviderUsd: required("max-usd"), maximumRequests: Number(required("max-requests")),
      createdAt: new Date().toISOString(), expiresAt: required("expires-at") }, await reviewed());
    await privateWrite(planFile, plan, true);
    await privateWrite(approvalFile, { version: 1, planDigest: providerEvalDigest(plan), authorizedBy: null,
      authorizationReference: null, approvedAt: null, expiresAt: plan.expiresAt, maximumProviderUsd: plan.maximumProviderUsd,
      maximumRequests: plan.maximumRequests, accountReference: null, syntheticOnly: true }, true);
    console.log(JSON.stringify({ planDigest: providerEvalDigest(plan), purpose: plan.purpose,
      plannedRequests: plan.profileIds.length * (1 + plan.fixtureIds.length * 3), maximumProviderUsd: plan.maximumProviderUsd,
      liveRequests: 0, approval: "not-approved", qualification: false }));
  } else if (command === "execute" || command === "report" || command === "reconcile") {
    // All required local artifacts are named before any provider can be called.
    // A later output write failure still preserves the durable dispatch journal.
    if (command !== "reconcile") required("output");
    if (command === "execute") {
      required("approval");
      if (options.get("live-authorized") !== "true") throw new Error("Live execution needs --live-authorized and a separately approved exact plan. This flag is not authorization.");
    }
    if (command === "reconcile") { required("usage"); required("attempt"); required("reference"); }
    const plan = validatePlan(await json(required("plan")));
    const journal = await openProviderEvalJournal(required("journal"));
    try {
      validateProviderEvalJournal(plan, journal.records);
      if (command === "reconcile") {
        const usage = await json(required("usage"));
        const record = reconcileProviderEvalAttempt(plan, journal.records, { attemptId: required("attempt"), evidenceReference: required("reference"),
          usage: usage as Parameters<typeof reconcileProviderEvalAttempt>[2]["usage"], at: new Date().toISOString() });
        await journal.append(record);
        console.log(JSON.stringify({ reconciled: record.type === "reconcile" ? record.attemptId : null, liveRequests: 0 }));
      } else {
        let result;
        if (command === "execute") {
          const approval = await json(required("approval"));
          const transport = createLiveProviderEvalTransport({ profileIds: plan.profileIds,
            apiKeys: { openai: process.env.OPENAI_API_KEY, google: process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY } });
          const controller = new AbortController(); const cancel = () => controller.abort();
          process.once("SIGINT", cancel); process.once("SIGTERM", cancel);
          try { result = await executeProviderEval({ plan, approval, records: journal.records, append: journal.append,
            transport, signal: controller.signal, reviewedFixtures: await reviewed() }); }
          finally { process.removeListener("SIGINT", cancel); process.removeListener("SIGTERM", cancel); }
        } else result = { ...summarizeProviderEvalJournal(plan, journal.records), stoppedReason: "report-only" };
        await privateWrite(required("output"), result.template);
        const { template: _template, ...summary } = result;
        console.log(JSON.stringify({ ...summary, purpose: plan.purpose, planDigest: providerEvalDigest(plan), independentHumanReview: "not-supplied-by-executor" }, null, 2));
      }
    } finally { await journal.close(); }
  } else throw new Error("Use plan, execute, report or reconcile. Planning never calls a provider.");
} catch (error) {
  // Transport errors are already sanitized; do not stringify provider payloads or environment values.
  console.error(error instanceof Error ? error.message : "Evaluation operation failed."); process.exitCode = 1;
}
