// Contract: docs/upgrade-2026-hosted-http-fault-rehearsal-spec.md.
// Local synthetic composition only; no deployed credentials or live services.
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { spawn, execFile } from "node:child_process";
import { createServer } from "node:http";
import net from "node:net";
import { mkdtemp, readFile, writeFile, mkdir, rm } from "node:fs/promises";
import { createWriteStream } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { createRequire } from "node:module";
import { once } from "node:events";
import { URL } from "node:url";
import { setTimeout as delay } from "node:timers/promises";

assert.equal(process.argv.length, 2, "No connection string or external target is accepted.");
process.umask(0o077);
const root = path.resolve(import.meta.dirname, "..");
// Next loads dotenv independently of the child environment. Never reuse it.
for (const dir of [root, path.join(root, "apps/web")]) {
  for (const name of [".env", ".env.local", ".env.production", ".env.production.local"]) {
    try { await readFile(path.join(dir, name)); throw new Error("Rehearsal requires production dotenv files to be absent."); }
    catch (error) { if (error.code !== "ENOENT") throw error; }
  }
}
const exec = promisify(execFile);
const pg = process.env.TAX_ENGINE_HTTP_REHEARSAL_PG_BIN || "/opt/homebrew/opt/postgresql@16/bin";
assert.ok(path.isAbsolute(pg));
const work = await mkdtemp(path.join(tmpdir(), "tax-hosted-http-"));
const evidence = path.join(root, ".local", "upgrade-evidence", path.basename(work));
await mkdir(evidence, { recursive: true, mode: 0o700 });
const env = Object.fromEntries(["HOME", "TMPDIR", "USER", "LANG"].filter(k => process.env[k]).map(k => [k, process.env[k]]));
env.PATH = path.dirname(process.execPath) + ":/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin";
env.CI = "true"; env.NEXT_TELEMETRY_DISABLED = "1";
const hash = x => createHash("sha256").update(x).digest("hex");
const receipt = { kind: "local-synthetic-hosted-production-http", checks: [], failures: [],
  actualUpstashNeonStripeSmtpProviderQualification: false, startedAt: new Date().toISOString() };
const children = [], logs = [];
let dbStarted = false, transport, restPort;
const data = path.join(work, "data"), cert = path.join(work, "server.crt"), key = path.join(work, "server.key");
async function command(name, bin, args) {
  try {
    const result = await exec(bin, args, { cwd: root, env, timeout: 60_000, maxBuffer: 4 * 1024 ** 2 });
    await writeFile(path.join(evidence, name + ".log"), result.stdout + result.stderr);
    return result.stdout.trim();
  } catch (error) {
    await writeFile(path.join(evidence, name + ".log"), String(error.stdout || "") + String(error.stderr || ""));
    throw new Error(name + " failed; retained local diagnostic", { cause: error });
  }
}
async function port() {
  const s = net.createServer(); await new Promise((resolve, reject) => { s.once("error", reject); s.listen(0, "127.0.0.1", resolve); });
  const p = s.address().port; await new Promise(resolve => s.close(resolve)); return p;
}
const dbPort = await port(), ports = [await port(), await port()];
assert.equal(new Set([dbPort, ...ports]).size, 3);
const origins = ports.map(p => `http://127.0.0.1:${p}`);
const database = new URL(`postgresql://ai_test@127.0.0.1:${dbPort}/postgres`);
database.searchParams.set("sslmode", "verify-full"); database.searchParams.set("sslrootcert", cert);
async function sql(query) {
  return command("sql-" + randomUUID(), path.join(pg, "psql"), [database.href, "-X", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-c", query]);
}
async function dbStart() {
  await command("postgres-start-" + randomUUID(), path.join(pg, "pg_ctl"), ["-D", data, "-l", path.join(evidence, "postgres.log"), "-w", "start", "-o", `-h 127.0.0.1 -p ${dbPort} -k ${work}`]); dbStarted = true;
}
async function dbStop() {
  await command("postgres-stop-" + randomUUID(), path.join(pg, "pg_ctl"), ["-D", data, "-m", "fast", "-w", "stop"]); dbStarted = false;
}
async function check(name, fn) {
  const start = Date.now();
  try { const detail = await fn(); receipt.checks.push({ name, status: "passed", durationMs: Date.now() - start, detail }); }
  catch (error) { receipt.failures.push({ name, message: String(error.message), durationMs: Date.now() - start }); }
}
function privateResponse(r) { assert.match(r.headers.get("cache-control") || "", /private/); assert.match(r.headers.get("cache-control") || "", /no-store/); }
async function request(server, route, { cookie, client = "198.51.100.73", ...options } = {}) {
  return fetch(origins[server] + route, { ...options, headers: { origin: origins[server], "x-real-ip": client,
    ...(cookie ? { cookie } : {}), ...(options.body ? { "content-type": "application/json" } : {}), ...options.headers },
    signal: globalThis.AbortSignal.timeout(12_000), redirect: "manual" });
}
const privateMarker = "PRIVATE-HTTP-ONLY-900-71-8891";
let mode = "normal", transportCalls = 0;
const counters = new Map(), sockets = new Set();
try {
  receipt.sourceHead = await command("source-head", "git", ["rev-parse", "HEAD"]);
  receipt.buildId = (await readFile(path.join(root, "apps/web/.next/BUILD_ID"), "utf8")).trim();
  receipt.runnerSha256 = hash(await readFile(import.meta.filename));
  await command("certificate", "openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "1", "-subj", "/CN=127.0.0.1",
    "-addext", "subjectAltName=IP:127.0.0.1", "-keyout", key, "-out", cert]);
  await command("initdb", path.join(pg, "initdb"), ["-D", data, "-U", "ai_test", "-A", "trust", "--no-locale", "-E", "UTF8"]);
  await writeFile(path.join(data, "pg_hba.conf"), "local all all trust\nhostssl all all 127.0.0.1/32 trust\nhostnossl all all 127.0.0.1/32 reject\n");
  await writeFile(path.join(data, "postgresql.auto.conf"), `ssl=on\nssl_cert_file='${cert}'\nssl_key_file='${key}'\n`);
  await dbStart();
  const restToken = randomUUID();
  transport = createServer(async (req, res) => {
    const reply = (status, body) => { if (!res.destroyed) { res.writeHead(status, { "content-type": "application/json" }); res.end(JSON.stringify(body)); } };
    try {
      assert.equal(req.headers.authorization, "Bearer " + restToken);
      let body = ""; for await (const chunk of req) { body += chunk; assert.ok(body.length < 100_000); }
      transportCalls++;
      if (mode === "disconnect") { req.socket.destroy(); return; }
      if (mode === "error") { reply(503, { error: "synthetic transport unavailable" }); return; }
      if (mode === "delay") await delay(3_000);
      const one = command => {
        assert.ok(Array.isArray(command));
        assert.ok(["eval", "evalsha"].includes(String(command[0]).toLowerCase()), "Unexpected controlled transport command");
        const count = Number(command[2]); assert.equal(count, 2);
        const [current, previous] = command.slice(3, 5), [limit, now, window, increment] = command.slice(5).map(Number);
        assert.ok([limit, now, window, increment].every(Number.isFinite)); assert.equal(increment, 1);
        const used = (counters.get(current) || 0) + Math.floor((1 - now % window / window) * (counters.get(previous) || 0));
        if (used >= limit) return { result: [-1, limit] };
        counters.set(current, (counters.get(current) || 0) + 1);
        return { result: [limit - used - 1, limit] };
      };
      const payload = JSON.parse(body); reply(200, req.url === "/pipeline" ? payload.map(one) : one(payload));
    } catch { reply(400, { error: "unsupported controlled transport request" }); }
  });
  transport.on("connection", socket => { sockets.add(socket); socket.once("close", () => sockets.delete(socket)); });
  await new Promise(resolve => transport.listen(0, "127.0.0.1", resolve));
  restPort = transport.address().port;
  const redisUrl = `http://127.0.0.1:${transport.address().port}`;
  const childEnv = { ...env, NODE_ENV: "production", TAX_ENGINE_DEPLOYMENT_MODE: "hosted", TAX_ENGINE_HOSTED_PERSISTENCE_BACKEND: "postgres-s3",
    DATABASE_URL: database.href, BETTER_AUTH_SECRET: randomUUID() + randomUUID(), BETTER_AUTH_URL: origins[0], TAX_ENGINE_APP_URL: origins[0],
    BETTER_AUTH_TRUSTED_ORIGINS: origins.join(","), TAX_ENGINE_BILLING_MODE: "test", UPSTASH_REDIS_REST_URL: redisUrl,
    UPSTASH_REDIS_REST_TOKEN: restToken, TAX_ENGINE_RATE_LIMIT_PREFIX: "http-synthetic-" + randomUUID(), NODE_EXTRA_CA_CERTS: cert };
  const webRequire = createRequire(path.join(root, "apps/web/package.json"));
  const next = webRequire.resolve("next/dist/bin/next");
  for (const p of ports) {
    const logfile = path.join(evidence, "next-" + p + ".log"), stream = createWriteStream(logfile); logs.push(logfile);
    await once(stream, "open");
    const child = spawn(process.execPath, [next, "start", "--hostname", "127.0.0.1", "--port", String(p)], { cwd: path.join(root, "apps/web"), env: childEnv, stdio: ["ignore", stream, stream] });
    const entry = { child, stream, spawnError: null };
    child.on("error", error => { entry.spawnError = error.code || "spawn-error"; });
    children.push(entry);
  }
  for (let n = 0; n < 2; n++) {
    let ready = false;
    for (let tries = 0; tries < 60; tries++) {
      assert.ok(children[n].spawnError === null && children[n].child.exitCode === null, "Owned Next server failed before readiness");
      try { ready = (await request(n, "/api/health")).status === 200; } catch { /* bounded startup */ }
      if (ready) break; await delay(500);
    }
    assert.ok(ready, "Owned Next production server failed readiness");
  }
  await check("database unavailable before auth initialization", async () => {
    await dbStop();
    try { const r = await request(0, "/api/auth/get-session"); assert.equal(r.status, 503); privateResponse(r); }
    finally { await dbStart(); }
  });
  await check("unauthenticated private HTTP", async () => { const r = await request(0, "/api/hosted/workspaces"); assert.equal(r.status, 401); privateResponse(r); });
  const accounts = [];
  for (let n = 0; n < 2; n++) {
    const r = await request(n, "/api/auth/sign-up/email", { method: "POST", body: JSON.stringify({ email: `synthetic-${randomUUID()}@example.invalid`, password: "local-only-" + randomUUID(), name: "Synthetic HTTP " + n, acceptedTerms: true }) });
    assert.equal(r.status, 200, "Synthetic real auth signup failed"); privateResponse(r);
    const body = await r.json(), cookie = r.headers.getSetCookie().map(s => s.split(";")[0]).join("; ");
    assert.ok(body.user?.id && cookie); accounts.push({ id: body.user.id, cookie });
    await sql(`INSERT INTO hosted_billing_subscriptions (stripe_subscription_id,owner_id,plan_id,status,last_event_id,last_event_created_at) VALUES ('synthetic-${n}','${body.user.id.replaceAll("'", "''")}','starter','active','synthetic-http-only',NOW())`);
  }
  assert.notEqual(accounts[0].id, accounts[1].id);
  const id = "synthetic-http-owned", route = "/api/hosted/workspaces/" + id;
  let saved;
  const savedByOwner = [];
  await check("real sessions two-owner create save reopen isolation deletion", async () => {
    const a = accounts[0], b = accounts[1];
    let r;
    for (let n = 0; n < 2; n++) {
      r = await request(n, route + "?create=1", { cookie: accounts[n].cookie }); assert.equal(r.status, 200); privateResponse(r);
      const own = (await r.json()).workspace; assert.equal(own.id, id);
      own.futurePrivateFact = privateMarker;
      own.documents = [{ id: "synthetic-document", name: privateMarker + ".pdf", taxYear: 2026, size: 42,
        uploadedAt: own.createdAt, kind: "w2", coverage: "supported", label: privateMarker, notes: privateMarker,
        matchedFixtureId: null, seededFactIds: ["wages"], blobStorageKey: privateMarker }];
      own.summary.totalDocuments = 1;
      own.updatedAt = `2026-11-04T0${n}:00:00.000Z`;
      r = await request(1 - n, route, { cookie: accounts[n].cookie, method: "POST", body: JSON.stringify({ workspace: own }) }); assert.equal(r.status, 200); privateResponse(r);
      savedByOwner.push((await r.json()).workspace);
      assert.ok(!JSON.stringify(savedByOwner[n]).includes(privateMarker));
      r = await request(1 - n, "/api/hosted/workspaces", { cookie: accounts[n].cookie }); assert.equal(r.status, 200); privateResponse(r);
      assert.deepEqual((await r.json()).workspaces, [savedByOwner[n]]);
    }
    saved = savedByOwner[0];
    assert.notDeepEqual(savedByOwner[0], savedByOwner[1]);
    r = await request(1, route, { cookie: a.cookie }); assert.deepEqual((await r.json()).workspace, savedByOwner[0]);
    r = await request(0, route, { cookie: b.cookie }); assert.deepEqual((await r.json()).workspace, savedByOwner[1]);
    // Delete B's same-ID row; A's exact row must survive.
    r = await request(1, route, { cookie: b.cookie, method: "DELETE" }); assert.equal(r.status, 200); privateResponse(r);
    r = await request(1, route, { cookie: b.cookie }); assert.equal(r.status, 200); privateResponse(r); assert.equal((await r.json()).workspace, null);
    r = await request(0, route, { cookie: b.cookie, method: "DELETE" }); assert.equal(r.status, 200); privateResponse(r);
    r = await request(1, route, { cookie: a.cookie }); assert.equal(r.status, 200); assert.deepEqual((await r.json()).workspace, savedByOwner[0]);
    assert.ok(!(await sql("SELECT workspace::text FROM hosted_workspace_shells")).includes(privateMarker));
    const foreign = await request(0, route + "?ownerId=" + a.id, { cookie: b.cookie }); assert.equal((await foreign.json()).workspace, null);
  });
  await check("actual PostgreSQL TLS sessions", async () => {
    const rows = JSON.parse(await sql("SELECT COALESCE(json_agg(json_build_object('ssl',s.ssl,'version',s.version)), '[]') FROM pg_stat_ssl s JOIN pg_stat_activity a USING(pid) WHERE a.usename='ai_test' AND a.backend_type='client backend'"));
    assert.ok(rows.length >= 3 && rows.every(r => r.ssl === true)); return rows;
  });
  await check("shared boundary across two production processes", async () => {
    for (let n = 0; n < 100; n++) { const r = await request(n % 2, "/api/hosted/workspaces", { client: "198.51.100.96" }); assert.equal(r.status, 401); }
    const r = await request(0, "/api/hosted/workspaces", { client: "198.51.100.96" }); assert.equal(r.status, 429); privateResponse(r); assert.ok(Number(r.headers.get("retry-after")) > 0);
  });
  const snapshot = () => sql("SELECT COALESCE(json_agg(t ORDER BY owner_id,workspace_id), '[]') FROM hosted_workspace_shells t");
  const before = await snapshot();
  for (const fault of ["disconnect", "error", "delay"]) await check("REST " + fault + " fails closed and recovers", async () => {
    mode = fault;
    try {
      const r = await request(0, route, { cookie: accounts[0].cookie, client: "198.51.100.97", method: "POST", body: JSON.stringify({ workspace: saved }) });
      assert.equal(r.status, 503); privateResponse(r); assert.equal((await r.json()).code, "rate-limit-unavailable"); assert.equal(await snapshot(), before);
    } finally { mode = "normal"; }
    const r = await request(1, route, { cookie: accounts[0].cookie }); assert.equal(r.status, 200); assert.equal((await r.json()).workspace.id, id);
  });
  await check("database outage HTTP errors and exact recovery", async () => {
    await dbStop();
    try {
      for (const target of ["/api/auth/get-session", route]) {
        const r = await request(0, target, { cookie: accounts[0].cookie }); assert.equal(r.status, 503, `Database outage status for ${target}`); privateResponse(r);
        const body = await r.text(); assert.ok(!body.includes(privateMarker) && !body.includes("postgresql://"));
      }
    } finally { await dbStart(); }
    assert.equal(await snapshot(), before);
    const r = await request(1, route, { cookie: accounts[0].cookie }); assert.equal(r.status, 200); assert.equal((await r.json()).workspace.id, id);
  });
  await check("oversized HTTP body and unavailable recovery", async () => {
    const r = await request(0, route, { cookie: accounts[0].cookie, method: "POST", body: JSON.stringify({ workspace: saved, padding: "x".repeat(5 * 1024 * 1024) }) });
    assert.equal(r.status, 413); privateResponse(r); assert.equal(await snapshot(), before);
    const recovery = await request(1, "/api/auth/request-password-reset", { method: "POST", body: JSON.stringify({ email: "synthetic@example.invalid" }) });
    assert.equal(recovery.status, 503); privateResponse(recovery);
  });
  await check("interrupted body preserves stored shell", async () => {
    const socket = net.connect(ports[0], "127.0.0.1");
    await new Promise((resolve, reject) => { socket.once("connect", resolve); socket.once("error", reject); });
    socket.write(`POST ${route} HTTP/1.1\r\nHost: 127.0.0.1:${ports[0]}\r\nOrigin: ${origins[0]}\r\nCookie: ${accounts[0].cookie}\r\nX-Real-IP: 198.51.100.98\r\nContent-Type: application/json\r\nContent-Length: 4000\r\n\r\n{"workspace":`);
    await delay(100); socket.destroy(); await delay(250); assert.equal(await snapshot(), before);
  });
  await check("owner delete persists across both production processes", async () => {
    const r = await request(1, route, { cookie: accounts[0].cookie, method: "DELETE" }); assert.equal(r.status, 200); privateResponse(r);
    const read = await request(0, route, { cookie: accounts[0].cookie }); assert.equal((await read.json()).workspace, null);
    assert.equal(await sql("SELECT count(*) FROM hosted_workspace_shells"), "0");
  });
  await check("finite response and application-log privacy", async () => {
    for (const logfile of logs) assert.ok(!(await readFile(logfile, "utf8")).includes(privateMarker));
  });
  receipt.transportCalls = transportCalls;
} catch (error) { receipt.failures.push({ name: "prerequisite or setup", message: String(error.message) }); }
finally {
  const cleanup = [];
  for (const { child, stream, spawnError } of children) {
    if (child.exitCode === null && child.signalCode === null && !spawnError) {
      child.kill("SIGTERM");
      await Promise.race([new Promise(resolve => child.once("exit", resolve)), delay(5_000)]);
      if (child.exitCode === null && child.signalCode === null) { child.kill("SIGKILL"); await new Promise(resolve => child.once("exit", resolve)); }
    }
    stream.end(); cleanup.push({ kind: "owned Next process", stopped: !!spawnError || child.exitCode !== null || child.signalCode !== null });
  }
  if (transport) { for (const socket of sockets) socket.destroy(); await new Promise(resolve => transport.close(resolve)); }
  // pg_ctl can time out after starting its child: inspect this owned cluster too.
  let ownedPidFile = false;
  try { await readFile(path.join(data, "postmaster.pid")); ownedPidFile = true; } catch { /* no owned pid */ }
  if (dbStarted || ownedPidFile) try { await dbStop(); } catch { cleanup.push({ kind: "owned PostgreSQL", stopped: false }); }
  for (const p of [dbPort, ...ports, ...(restPort ? [restPort] : [])]) {
    const closed = await new Promise(resolve => { const s = net.connect(p, "127.0.0.1"); s.once("connect", () => { s.destroy(); resolve(false); }); s.once("error", () => { s.destroy(); resolve(true); }); });
    cleanup.push({ kind: "owned port", port: p, closed });
  }
  receipt.cleanup = cleanup;
  receipt.cleanupPassed = cleanup.every(x => x.stopped !== false && x.closed !== false);
  if (receipt.cleanupPassed) await rm(work, { recursive: true, force: true });
  receipt.finishedAt = new Date().toISOString(); receipt.status = receipt.failures.length === 0 && receipt.cleanupPassed ? "passed" : "failed";
  await writeFile(path.join(evidence, "receipt.json"), JSON.stringify(receipt, null, 2) + "\n");
  console.log(JSON.stringify({ status: receipt.status, checks: receipt.checks.length, failures: receipt.failures.length, evidence, cleanupPassed: receipt.cleanupPassed }));
  if (receipt.status !== "passed") process.exitCode = 1;
}
