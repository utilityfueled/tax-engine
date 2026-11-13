import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";

const postgresImage = "postgres:16.16-bookworm@sha256:a49f7438ba03589f9b1ca062f2da82e899b48ea1dc50d2449fa09a70be83ebca";
type DatabaseServices = { services: { postgres: { image: string } } };
type WorkflowStep = { id?: string; run?: string; "continue-on-error"?: boolean; with?: { name?: string; path?: string } };
type ContainerJob = { env: Record<string, string>; steps: WorkflowStep[] };
const { jobs: ci } = parse(readFileSync(".github/workflows/ci.yml", "utf8")) as { jobs: Record<string, DatabaseServices> };
const { jobs: { container } } = parse(readFileSync(".github/workflows/web.yml", "utf8")) as { jobs: { container: ContainerJob } };

describe("PostgreSQL 16.16 self-host recovery", () => {
  it("uses the same verified multi-platform database in Compose and both CI test jobs", () => {
    const compose = parse(readFileSync("compose.yaml", "utf8")) as DatabaseServices;
    expect(compose.services.postgres.image).toBe(postgresImage);
    expect(ci["unit-test"].services.postgres.image).toBe(postgresImage);
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
