import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { URL } from "node:url";
import { createHash, randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { promisify } from "node:util";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { ensureHostedAppSchema, getHostedServerDatabase } from "../apps/web/src/lib/hosted-server-db.ts";
import { resolveLocalContainerRuntime } from "./local-container-runtime.mjs";

// Run with node --import tsx. This creates its own local-only Compose project,
// database volume and browser profile. It never connects to DATABASE_URL or
// uses provider/payment credentials. Only its uniquely named resources are removed.
const [previousImage, candidateImage] = process.argv.slice(2);
if (!previousImage || !candidateImage || process.argv.length !== 4) {
  throw new Error("Usage: node --import tsx scripts/rehearse-self-host-release.mjs PREVIOUS_IMAGE CANDIDATE_IMAGE");
}
const runtime = process.env.TAX_ENGINE_CONTAINER_RUNTIME || "docker";
assert.ok(["docker", "podman"].includes(runtime));
const connection = resolveLocalContainerRuntime(runtime);
const root = path.resolve(import.meta.dirname, "..");
const project = `tax-rehearsal-${randomUUID().slice(0, 8)}`;
const work = await mkdtemp(path.join(tmpdir(), `${project}-`));
const override = path.join(work, "compose.override.json");
const require = createRequire(new URL("../apps/web/package.json", import.meta.url));
const { chromium, expect } = require("@playwright/test");
const exec = promisify(execFile);
const hash = value => createHash("sha256").update(value).digest("hex");
const evidence = { kind: "local-synthetic-compose-release-rehearsal", project, phases: [] };
let browser;
let db;
let attemptedStart = false;
let failure;

async function command(args, executable = runtime, env = process.env) {
  const runtimeCommand = executable === runtime;
  const commandEnv = { ...env };
  if (runtimeCommand) for (const name of ["DOCKER_CONTEXT", "DOCKER_HOST", "CONTAINER_HOST", "CONTAINER_CONNECTION"]) delete commandEnv[name];
  const { stdout } = await exec(executable, runtimeCommand ? [...connection.args, ...args] : args, {
    cwd: root, env: commandEnv, encoding: "utf8", timeout: 180_000, maxBuffer: 4 * 1024 * 1024,
  });
  return stdout.trim();
}
async function unusedPort() {
  const server = createServer();
  await new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  return address.port;
}
const webPort = await unusedPort();
const pgPort = await unusedPort();
const origin = `http://127.0.0.1:${webPort}`;
const databaseUrl = `postgresql://ai_test@127.0.0.1:${pgPort}/postgres`;
const composeEnv = { ...process.env, WEB_PORT: `127.0.0.1:${webPort}`, POSTGRES_PORT: String(pgPort) };
const composeArgs = ["compose", "--project-name", project, "--env-file", path.join(root, ".env.docker.example"),
  "--file", path.join(root, "compose.yaml"), "--file", override];
const compose = (...args) => command([...composeArgs, ...args], runtime, composeEnv);

async function configure(image, architecture) {
  await writeFile(override, JSON.stringify({ services: {
    web: {
      // Security controls must come from the actual shipped Compose file.
      image, platform: `linux/${architecture}`, restart: "no",
      environment: {
        DATABASE_URL: "postgresql://ai_test@postgres:5432/postgres", TAX_ENGINE_DEPLOYMENT_MODE: "self-host",
        TAX_ENGINE_HOSTED_PERSISTENCE_BACKEND: "preview-memory", TAX_ENGINE_BILLING_MODE: "test",
        TAX_ENGINE_APP_URL: origin, MODEL_PROVIDER_API_KEY: "", OPENAI_API_KEY: "", GEMINI_API_KEY: "", GOOGLE_API_KEY: "",
        MODEL_PROVIDER_BASE_URL: "https://api.openai.com/v1", BETTER_AUTH_SECRET: "", BETTER_AUTH_TRUSTED_ORIGINS: "",
        STRIPE_SECRET_KEY: "", STRIPE_WEBHOOK_SECRET: "", STRIPE_PRICE_ID_STARTER_MONTHLY: "",
        STRIPE_PRICE_ID_PLUS_MONTHLY: "", STRIPE_PRICE_ID_AI_HELPER_TOP_UP: "", SENTRY_DSN: "", NEXT_PUBLIC_SENTRY_DSN: "",
      },
    },
    postgres: {
      platform: `linux/${architecture}`, restart: "no",
      environment: { POSTGRES_USER: "ai_test", POSTGRES_DB: "postgres", POSTGRES_PASSWORD: "synthetic_rehearsal_only", POSTGRES_HOST_AUTH_METHOD: "trust" },
    },
  } }, null, 2));
}
async function ready() {
  for (let attempt = 0; attempt < 90; attempt++) {
    try { if ((await fetch(`${origin}/api/health`, { signal: globalThis.AbortSignal.timeout(2_000) })).ok) return; } catch { /* starting */ }
    await delay(1_000);
  }
  throw new Error("The isolated self-host web service did not become healthy.");
}
async function databaseSnapshot() {
  const rows = await db.pool.query("SELECT owner_id, workspace_id, workspace FROM hosted_workspace_shells ORDER BY owner_id");
  const costs = await db.pool.query("SELECT provider_cost_usd::text AS cost FROM hosted_ai_attempts ORDER BY owner_id, request_id, attempt");
  assert.equal(rows.rows.length, 2);
  assert.equal(costs.rows[0].cost, "0.0000006");
  return hash(JSON.stringify({ workspaces: rows.rows, costs: costs.rows }));
}
async function documentBytes(page, id) {
  return page.evaluate(async id => {
    const db = await new Promise((resolve, reject) => {
      const request = globalThis.indexedDB.open("tax-engine-workspace-document-cache", 1);
      request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
    });
    try {
      const records = await new Promise((resolve, reject) => {
        const request = db.transaction("workspace-document-files", "readonly").objectStore("workspace-document-files").getAll();
        request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
      });
      if (id === null) return records.length;
      const record = records.find(record => record.workspaceId === id);
      return record ? [...new Uint8Array(await record.file.arrayBuffer())] : null;
    } finally { db.close(); }
  }, id);
}

try {
  const previous = JSON.parse(await command(["image", "inspect", previousImage]))[0];
  const candidate = JSON.parse(await command(["image", "inspect", candidateImage]))[0];
  assert.equal(previous.Architecture, candidate.Architecture, "Upgrade images must target the same architecture.");
  assert.ok(["arm64", "amd64"].includes(candidate.Architecture));
  evidence.platform = `linux/${candidate.Architecture}`;
  evidence.previousDigest = previous.Id;
  evidence.candidateDigest = candidate.Id;
  await configure(previousImage, candidate.Architecture);
  attemptedStart = true;
  console.log(`${project}: start previous image and isolated database`);
  await compose("up", "--detach", "--no-build", "--wait", "--wait-timeout", "120");
  await ready();
  const dbEnv = { TAX_ENGINE_DEPLOYMENT_MODE: "hosted", NODE_ENV: "test", DATABASE_URL: databaseUrl };
  await ensureHostedAppSchema(dbEnv);
  db = await getHostedServerDatabase(dbEnv);
  // Restarting the disposable server closes idle connections; later assertions
  // require a successful reconnection and identical data.
  db.pool.on("error", () => {});
  for (const owner of ["synthetic-owner-a", "synthetic-owner-b"]) {
    await db.pool.query("INSERT INTO hosted_workspace_shells VALUES ($1,'shared-synthetic-return','2026-10-25T00:00:00Z','2026-10-25T00:00:00Z',$2::jsonb)",
      [owner, JSON.stringify({ id: "shared-synthetic-return", storageMode: "local-browser", returnSummary: { targetTaxYear: null } })]);
  }
  await db.pool.query("INSERT INTO hosted_ai_reservations (owner_id,request_id,payload_digest,cycle_key,included_budget_cents,included_reserved_cents,purchased_reserved_cents,included_charge_cents,state) VALUES ('synthetic-owner-a','rehearsal-request','synthetic-digest','2026-10',100,1,0,1,'settled')");
  await db.pool.query("INSERT INTO hosted_ai_attempts (owner_id,request_id,attempt,task,profile_id,model_id,state,started_at,completed_at,usage,provider_cost_usd,pricing_effective_from) VALUES ('synthetic-owner-a','rehearsal-request',1,'summary','synthetic','synthetic','accepted','2026-10-25T00:00:00Z','2026-10-25T00:00:01Z','{\"inputTokens\":1,\"outputTokens\":1}',0.0000006,'2026-10-25')");
  const beforeDatabase = await databaseSnapshot();

  browser = await chromium.launchPersistentContext(path.join(work, "browser"), { headless: true, baseURL: origin });
  const page = await browser.newPage();
  page.setDefaultTimeout(15_000);
  const requests = [];
  page.on("request", request => requests.push(`${request.url()}\n${request.postData() ?? ""}`));
  const pdf = await PDFDocument.create();
  pdf.addPage().drawText("Synthetic source for release recovery only", { font: await pdf.embedFont(StandardFonts.Helvetica), size: 12 });
  const originalBytes = Buffer.from(await pdf.save());
  await page.goto("/");
  await page.evaluate(() => globalThis.localStorage.setItem("tax-engine:guided-mode", "false"));
  await page.getByRole("button", { name: /start your tax return/i }).click();
  await expect(page).toHaveURL(/\/returns\/(?!new)[a-z0-9-]+/i);
  const id = new URL(page.url()).pathname.split("/").at(-1);
  assert.ok(id);
  await page.locator('input[type="file"]').setInputFiles({ name: "synthetic-release-source.pdf", mimeType: "application/pdf", buffer: originalBytes });
  await expect(page.getByText("synthetic-release-source.pdf", { exact: true }).first()).toBeVisible();
  const originalFlow = JSON.stringify({ taxYear: null, phase: "interview", currentSectionIndex: 0, completedSections: [],
    segmentation: { filingStatus: "single", incomeTypes: [], lifeEvents: [], stateCode: null },
    sectionData: { "personal-info": { firstName: "Synthetic", ssn: "900-70-0033" },
      extension: { zero: "0.00", cents: "9007199254740993.27", unanswered: null } } });
  await page.evaluate(({ id, originalFlow }) => globalThis.localStorage.setItem(`tax-engine.guided-flow-state.v1:${id}`, originalFlow), { id, originalFlow });
  const verify = async (label, expectedImage) => {
    await ready();
    await page.goto(`/returns/${id}?local=1`);
    await expect(page.getByRole("heading", { name: `Tax Return ${id}`, exact: true })).toBeVisible();
    assert.equal(await page.evaluate(id => globalThis.localStorage.getItem(`tax-engine.guided-flow-state.v1:${id}`), id), originalFlow);
    assert.deepEqual(Buffer.from(await documentBytes(page, id)), originalBytes);
    assert.equal(await databaseSnapshot(), beforeDatabase);
    const serviceId = await compose("ps", "--quiet", "web");
    const metadata = JSON.parse(await command(["inspect", serviceId]))[0];
    assert.equal(metadata.HostConfig.ReadonlyRootfs, true);
    // Podman expands ALL into individual capability names; verify the actual
    // kernel bounding set below instead of assuming Docker's inspect format.
    assert.ok(metadata.HostConfig.CapDrop.length > 0);
    assert.deepEqual(metadata.HostConfig.CapAdd ?? [], []);
    assert.ok(metadata.HostConfig.SecurityOpt.some(value => value.startsWith("no-new-privileges")));
    assert.equal(metadata.Image.replace(/^sha256:/u, ""), expectedImage.replace(/^sha256:/u, ""));
    const runtimeFacts = JSON.parse(await command(["exec", serviceId, "node", "-e",
      "const status=require('node:fs').readFileSync('/proc/self/status','utf8'); console.log(JSON.stringify({uid:process.getuid(),arch:process.arch,node:process.version,noNewPrivileges:/^NoNewPrivs:\\s+1$/m.test(status),noEffectiveCapabilities:/^CapEff:\\s+0+$/m.test(status),noBoundingCapabilities:/^CapBnd:\\s+0+$/m.test(status),providerKeys:['MODEL_PROVIDER_API_KEY','OPENAI_API_KEY','GEMINI_API_KEY','GOOGLE_API_KEY'].some(k=>Boolean(process.env[k]))}))"]));
    assert.equal(runtimeFacts.uid, 1001);
    assert.equal(runtimeFacts.noNewPrivileges, true);
    assert.equal(runtimeFacts.noEffectiveCapabilities, true);
    assert.equal(runtimeFacts.noBoundingCapabilities, true);
    assert.equal(runtimeFacts.arch, candidate.Architecture === "amd64" ? "x64" : "arm64");
    assert.equal(runtimeFacts.providerKeys, false);
    evidence.phases.push({ phase: label, imageDigest: metadata.Image, databaseSha256: beforeDatabase,
      browserFactsSha256: hash(originalFlow), documentSha256: hash(originalBytes), readOnly: true, runtimeFacts });
    console.log(`${project}: ${label} preserves database rows, exact cost, browser facts and original document bytes`);
  };
  await verify("previous", previous.Id);
  await configure(candidateImage, candidate.Architecture);
  await compose("up", "--detach", "--no-build", "--no-deps", "--force-recreate", "web");
  await verify("upgrade", candidate.Id);
  await compose("stop", "postgres");
  await assert.rejects(databaseSnapshot());
  await compose("up", "--detach", "--no-build", "--wait", "--wait-timeout", "120", "postgres");
  await verify("database-restart", candidate.Id);
  // Exercise actual application migration/dump/restore in another unique schema
  // on this disposable Compose database, leaving the persistent sentinel intact.
  const restoreOutput = await command(["--import", "tsx", "scripts/rehearse-hosted-recovery.ts"], process.execPath,
    { ...process.env, TSX_TSCONFIG_PATH: path.join(root, "apps/web/tsconfig.json"), TAX_ENGINE_TEST_AI_LEDGER_DATABASE_URL: databaseUrl });
  evidence.databaseRecovery = JSON.parse(restoreOutput.split("\n").at(-1));
  assert.equal(evidence.databaseRecovery.result, "passed");
  await verify("database-dump-restore", candidate.Id);
  await configure(previousImage, candidate.Architecture);
  await compose("up", "--detach", "--no-build", "--no-deps", "--force-recreate", "web");
  await verify("rollback", previous.Id);
  await configure(candidateImage, candidate.Architecture);
  await compose("up", "--detach", "--no-build", "--no-deps", "--force-recreate", "web");
  await verify("re-upgrade", candidate.Id);

  await page.goto("/");
  const card = page.getByRole("listitem").filter({ hasText: `Tax Return ${id}` });
  await card.getByText("Back up this return", { exact: true }).click();
  await card.getByLabel("Backup password (at least 12 characters)").fill("synthetic-release-password");
  const downloadPromise = page.waitForEvent("download");
  await card.getByRole("button", { name: "Download encrypted backup", exact: true }).click();
  const archive = path.join(work, "synthetic-backup.json");
  await (await downloadPromise).saveAs(archive);
  const encrypted = await readFile(archive, "utf8");
  assert.ok(!encrypted.includes("900-70-0033"));
  const envelope = JSON.parse(encrypted);
  assert.equal(envelope.cipher, "AES-256-GCM");
  assert.equal(envelope.kdf, "PBKDF2-SHA256");
  assert.equal(envelope.iterations, 600_000);
  await card.getByRole("button", { name: `Delete tax return ${id}`, exact: true }).click();
  await expect(card).toHaveCount(0);
  await page.reload();
  assert.equal(await documentBytes(page, id), null);
  const restore = page.locator("details").filter({ has: page.getByText("Restore an encrypted backup", { exact: true }) });
  await restore.getByText("Restore an encrypted backup", { exact: true }).click();
  await restore.getByLabel("Encrypted recovery file").setInputFiles(archive);
  await restore.getByLabel("Backup password (at least 12 characters)").fill("incorrect-release-password");
  await restore.getByRole("button", { name: "Restore as new local return", exact: true }).click();
  await expect(restore.getByRole("status")).toContainText("incorrect");
  await expect(page.getByRole("button", { name: /^Delete tax return / })).toHaveCount(0);
  assert.equal(await documentBytes(page, null), 0);
  const corrupted = { ...envelope };
  const ciphertext = Buffer.from(corrupted.ciphertext, "base64");
  ciphertext[0] ^= 1;
  corrupted.ciphertext = ciphertext.toString("base64");
  const tampered = path.join(work, "tampered-backup.json");
  await writeFile(tampered, JSON.stringify(corrupted));
  await restore.getByLabel("Encrypted recovery file").setInputFiles(tampered);
  await restore.getByLabel("Backup password (at least 12 characters)").fill("synthetic-release-password");
  await restore.getByRole("button", { name: "Restore as new local return", exact: true }).click();
  await expect(restore.getByRole("status")).toContainText("damaged");
  await expect(page.getByRole("button", { name: /^Delete tax return / })).toHaveCount(0);
  assert.equal(await documentBytes(page, null), 0);
  await restore.getByLabel("Encrypted recovery file").setInputFiles(archive);
  await restore.getByLabel("Backup password (at least 12 characters)").fill("synthetic-release-password");
  await restore.getByRole("button", { name: "Restore as new local return", exact: true }).click();
  const link = restore.getByRole("link", { name: "Open restored return", exact: true });
  await expect(link).toBeVisible();
  const recoveredId = (await link.getAttribute("href")).split("/").at(-1).split("?")[0];
  assert.notEqual(recoveredId, id);
  await link.click();
  await page.reload();
  assert.equal(await page.evaluate(id => globalThis.localStorage.getItem(`tax-engine.guided-flow-state.v1:${id}`), recoveredId), originalFlow);
  assert.deepEqual(Buffer.from(await documentBytes(page, recoveredId)), originalBytes);
  await page.goto("/");
  await page.getByRole("button", { name: `Delete tax return ${recoveredId}`, exact: true }).click();
  await expect(page.getByRole("listitem").filter({ hasText: `Tax Return ${recoveredId}` })).toHaveCount(0);
  assert.equal(await documentBytes(page, recoveredId), null);
  for (const privateValue of ["900-70-0033", "synthetic-release-source.pdf", "%PDF-"]) assert.ok(!requests.join("\n").includes(privateValue));
  evidence.browserRecovery = { passed: true, encrypted: true, wrongPasswordRejected: true, tamperRejected: true,
    originalBytes: true, unknownYearPreserved: true, exactCents: true, deletion: true,
    networkObservation: { requests: requests.length, startsBeforeUpload: true, rawPrivateMarkersAbsent: true,
      limitation: "Checks raw request URLs and postData for the synthetic SSN, filename and PDF signature; not a general encoded or binary PII proof." } };
  evidence.result = "passed";
} catch (error) {
  failure = error;
} finally {
  const cleanupFailures = [];
  for (const [label, cleanup] of [
    ["browser", async () => { if (browser) await browser.close(); }],
    ["database client", async () => { if (db) await db.db.destroy(); }],
    ["Compose project", async () => { if (attemptedStart) await compose("down", "--volumes", "--remove-orphans"); }],
    ["temporary files", async () => { await rm(work, { recursive: true, force: true }); }],
  ]) {
    try { await cleanup(); } catch { cleanupFailures.push(label); }
  }
  if (cleanupFailures.length) {
    console.error(`Incomplete cleanup for ${project}: ${cleanupFailures.join(", ")}.`);
    failure ??= new Error("Release rehearsal cleanup was incomplete.");
  }
}
if (failure) throw failure;
console.log(JSON.stringify(evidence, null, 2));
