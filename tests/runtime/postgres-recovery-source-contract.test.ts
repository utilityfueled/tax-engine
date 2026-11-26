import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";

const postgresImage = "postgres:16.16-bookworm@sha256:a49f7438ba03589f9b1ca062f2da82e899b48ea1dc50d2449fa09a70be83ebca";
type DatabaseServices = { services: { postgres: { image: string } } };
type WorkflowStep = { id?: string; run?: string; "continue-on-error"?: boolean; with?: { name?: string; path?: string } };
type ContainerJob = { env: Record<string, string>; steps: WorkflowStep[]; defaults?: { run?: { shell?: string } } };
type ShardCaller = { uses: string; with: { shard: string } };
const { jobs: ci } = parse(readFileSync(".github/workflows/ci.yml", "utf8")) as { jobs: {
  test: DatabaseServices;
  "unit-test-shard-1": ShardCaller;
  "unit-test-shard-2": ShardCaller;
} };
const { jobs: { "unit-test": unit } } = parse(readFileSync(".github/workflows/unit-tests.yml", "utf8")) as { jobs: { "unit-test": DatabaseServices } };
const { jobs: { container } } = parse(readFileSync(".github/workflows/web.yml", "utf8")) as { jobs: { container: ContainerJob } };
const { jobs: { recovery: arm64 } } = parse(readFileSync(".github/workflows/arm64-recovery.yml", "utf8")) as { jobs: { recovery: ContainerJob } };

describe("PostgreSQL 16.16 self-host recovery", () => {
  it("uses the same verified multi-platform database in Compose and both CI test jobs", () => {
    const compose = parse(readFileSync("compose.yaml", "utf8")) as DatabaseServices;
    expect(compose.services.postgres.image).toBe(postgresImage);
    expect(ci["unit-test-shard-1"]).toMatchObject({ uses: "./.github/workflows/unit-tests.yml", with: { shard: "1/2" } });
    expect(ci["unit-test-shard-2"]).toMatchObject({ uses: "./.github/workflows/unit-tests.yml", with: { shard: "2/2" } });
    expect(unit.services.postgres.image).toBe(postgresImage);
    expect(ci.test.services.postgres.image).toBe(postgresImage);
  });

  it("runs the recovery client check first and retains its receipt with the runtime artifacts", () => {
    const { steps, env } = container;
    expect(env.TAX_ENGINE_TEST_POSTGRES_BIN).toBe("/usr/lib/postgresql/16/bin");
    const install = steps.findIndex(step => step.id === "postgres_client_install");
    const verify = steps.findIndex(step => step.id === "postgres_client_versions");
    const rehearse = steps.findIndex(step => step.run?.includes("scripts/rehearse-self-host-release.mjs"));
    expect(install).toBeGreaterThanOrEqual(0);
    expect(verify).toBeGreaterThan(install);
    expect(rehearse).toBeGreaterThan(verify);
    expect(steps[verify]?.["continue-on-error"]).toBeUndefined();
    const artifact = steps.find(step => step.with?.name === "container-runtime-evidence");
    expect(artifact?.with?.path).toContain("container-postgres-client-versions.txt");
  });

  it("authenticates the self-host download against originals before deleting the source", () => {
    const source = readFileSync("scripts/rehearse-self-host-release.mjs", "utf8");
    const phase = source.indexOf('phase = "browser-backup-restore-delete"');
    const snapshot = source.indexOf("await captureRecoveryOriginals(page, id, originalFlow, originalBytes)", phase);
    const download = source.indexOf("await readFile(archive,", phase);
    const verification = source.indexOf("assertEncryptedRecoveryOriginals(encrypted, backupPassword, originals)", phase);
    const deletion = source.indexOf("Delete tax return ${id}", phase);
    expect(phase).toBeGreaterThan(0);
    expect(snapshot).toBeGreaterThan(phase);
    expect(download).toBeGreaterThan(snapshot);
    expect(verification).toBeGreaterThan(download);
    expect(deletion).toBeGreaterThan(verification);
  });

  it("restores the archive only after starting and checking a fresh browser profile", () => {
    const source = readFileSync("scripts/rehearse-self-host-release.mjs", "utf8");
    const sourceProfile = source.indexOf('await startBrowserProfile("source-browser")');
    const deleteSource = source.indexOf("Delete tax return ${id}", sourceProfile);
    const closeSource = source.indexOf("await browser.close()", deleteSource);
    const recoveryProfile = source.indexOf('await startBrowserProfile("recovery-browser")', closeSource);
    const checkEmptyDocuments = source.indexOf("assert.equal(await documentBytes(page, null), 0)", recoveryProfile);
    const firstImport = source.indexOf('getByLabel("Encrypted recovery file").setInputFiles(archive)', recoveryProfile);
    expect(sourceProfile).toBeGreaterThanOrEqual(0);
    expect(deleteSource).toBeGreaterThan(sourceProfile);
    expect(closeSource).toBeGreaterThan(deleteSource);
    expect(recoveryProfile).toBeGreaterThan(closeSource);
    expect(checkEmptyDocuments).toBeGreaterThan(recoveryProfile);
    expect(firstImport).toBeGreaterThan(checkEmptyDocuments);
  });

  it("retains the ARM64 Compose recovery result with the native artifact receipts", () => {
    const rehearsal = arm64.steps.find(step => step.run?.includes("scripts/rehearse-self-host-release.mjs"));
    expect(rehearsal?.run).toContain("| tee container-recovery.log");
    expect(arm64.defaults?.run?.shell).toBe("bash");
    expect(rehearsal?.["continue-on-error"]).toBeUndefined();
    const artifact = arm64.steps.find(step => step.with?.name === "native-arm64-archive-evidence");
    expect(artifact?.with?.path).toContain("container-recovery.log");
  });

  it("requires per-run SCRAM credentials before creating rehearsal data", () => {
    const source = readFileSync("scripts/rehearse-self-host-release.mjs", "utf8");
    expect(source).toContain('const databasePassword = randomBytes(32).toString("hex")');
    expect(source).toContain('POSTGRES_HOST_AUTH_METHOD: "scram-sha-256"');
    expect(source).toContain('POSTGRES_INITDB_ARGS: "--auth-host=scram-sha-256"');
    expect(source).not.toContain('POSTGRES_HOST_AUTH_METHOD: "trust"');
    expect(source).toContain('await assert.rejects(probe(undefined),');
    expect(source).toContain('await assert.rejects(probe("wrong-rehearsal-password"),');
    expect(source).toContain('error?.code === "28P01"');
    const authentication = source.indexOf('await verifyDatabaseAuthentication();');
    const historical = source.indexOf('evidence.previousSchemaMigration = await rehearsePreviousSchema(', authentication);
    const candidate = source.indexOf('await ensureHostedAppSchema(dbEnv);', historical);
    const restart = source.indexOf('await verify("database-restart"', candidate);
    expect(authentication).toBeGreaterThan(0);
    expect(historical).toBeGreaterThan(authentication);
    expect(candidate).toBeGreaterThan(historical);
    expect(restart).toBeGreaterThan(candidate);
    expect(source).toContain('await verifyDatabaseAuthentication();\n  await verify("database-restart"');
  });

  it("keeps rehearsal credentials off command arguments, web configuration and evidence", () => {
    const source = readFileSync("scripts/rehearse-self-host-release.mjs", "utf8");
    expect(source).toContain('const passfile = path.join(work, "pgpass");');
    expect(source).toContain('{ mode: 0o600, flag: "wx" }');
    expect(source).toContain('}, null, 2), { mode: 0o600 });');
    expect(source).toContain('PGPASSFILE: passfile');
    expect(source).toContain('TAX_ENGINE_TEST_AI_LEDGER_DATABASE_URL: databaseUrl');
    expect(source).not.toContain('DATABASE_URL: "postgresql://ai_test@postgres');
    expect(source).not.toMatch(/(?:console\.[a-z]+|evidence\.[a-z]+)[^\n]*databasePassword/iu);
  });

  it.each([
    { dump: "16.16", restore: "16.16", passes: true },
    { dump: "16.17", restore: "16.20", passes: true },
    { dump: "16.15", restore: "16.16", passes: false },
    { dump: "16.16", restore: "16.15", passes: false },
    { dump: "16.16", restore: "17.12", passes: false },
    { dump: "16.16beta1", restore: "16.16", passes: false },
  ])("checks pg_dump $dump and pg_restore $restore (passes=$passes)", ({ dump, restore, passes }) => {
    const command = container.steps.find(step => step.id === "postgres_client_versions")?.run;
    if (!command) throw new Error("PostgreSQL recovery client check is missing");
    const work = mkdtempSync(join(tmpdir(), "tax-engine-postgres-version-check-"));
    try {
      for (const [tool, version] of [["pg_dump", dump], ["pg_restore", restore]]) {
        writeFileSync(join(work, tool), `#!/bin/sh\nprintf '%s\\n' '${tool} (PostgreSQL) ${version} (PGDG)'\n`, { mode: 0o700 });
      }
      const checked = spawnSync("bash", ["-e", "-o", "pipefail", "-c", command], {
        cwd: work, encoding: "utf8", env: { PATH: process.env.PATH, TAX_ENGINE_TEST_POSTGRES_BIN: work },
      });
      expect(checked.error).toBeUndefined();
      expect(checked.status).toBe(passes ? 0 : 1);
      if (passes) {
        expect(readFileSync(join(work, "container-postgres-client-versions.txt"), "utf8")).toBe(
          `pg_dump (PostgreSQL) ${dump} (PGDG)\npg_restore (PostgreSQL) ${restore} (PGDG)\n`,
        );
      }
    } finally {
      rmSync(work, { recursive: true, force: true });
    }
  });
});
