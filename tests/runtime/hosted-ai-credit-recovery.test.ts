import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
const url=process.env.TAX_ENGINE_TEST_AI_LEDGER_DATABASE_URL;
// Spec: federal/hosted-recovery-cold-import.yaml. Real file-only child; no DB.
describe("hosted recovery cold startup", () => {
  it("imports the real rehearsal without the unrelated calculation barrel", () => {
    const env: NodeJS.ProcessEnv = { ...process.env, TSX_TSCONFIG_PATH: resolve("apps/web/tsconfig.json") };
    delete env.TAX_ENGINE_TEST_AI_LEDGER_DATABASE_URL;
    delete env.DATABASE_URL;
    const probe = `import { registerHooks } from 'node:module';
      import { pathToFileURL } from 'node:url';
      registerHooks({ resolve(specifier, context, next) {
        const result = next(specifier, context);
        if (result.url.endsWith('/packages/engine/src/index.ts')) throw new Error('Unrelated calculation barrel loaded');
        return result;
      } });
      const target = process.argv[1];
      process.argv.splice(1); // Import as a library; do not select the CLI entry point.
      await import(pathToFileURL(target).href);
      console.log('recovery-file-only-import-passed');`;
    const result = spawnSync(process.execPath, ["--import", "tsx", "--input-type=module", "-e", probe, resolve("scripts/rehearse-hosted-recovery.ts")], { encoding: "utf8", timeout: 4500, env });
    expect(result.error).toBeUndefined(); expect(result.status, result.stderr).toBe(0);
    expect(result.stdout.trim()).toBe("recovery-file-only-import-passed");
  });
  it("preserves the actual canonical synthetic workspace without shared state", async () => {
    const { createWorkspaceRecord } = await import("../../apps/web/src/lib/workspace-storage");
    const { createRecoveryWorkspace } = await import("../../scripts/rehearse-hosted-recovery");
    const expected = createWorkspaceRecord("synthetic-shared-return", { now: "2026-10-24T12:00:00.000Z" });
    const actual = createRecoveryWorkspace();
    expect(actual).toEqual(expected);
    actual.documents.push({ id: "synthetic mutation" } as typeof actual.documents[number]);
    actual.checklist[0].status = "ready";
    actual.auditTrail[0].documentIds.push("synthetic mutation");
    expect(createRecoveryWorkspace()).toEqual(expected);
  });
});
// Spec: federal/hosted-ai-credit-issuance.yaml. Disposable source-validated cluster only.
describe.skipIf(!url)("AI credit issuance backup and migration",()=>{
  it("restores original issuance and migrates an actual pre-issuance archive",()=>{
    const result=spawnSync(process.execPath,["--import","tsx","scripts/rehearse-hosted-recovery.ts"],{encoding:"utf8",timeout:4500,env:{...process.env,TSX_TSCONFIG_PATH:resolve("apps/web/tsconfig.json")}});
    expect(result.error).toBeUndefined();expect(result.status,result.stderr).toBe(0);
    const lastLine=result.stdout.trim().split("\n").at(-1);
    if(!lastLine) throw new Error("Recovery rehearsal did not emit its receipt.");
    const receipt=JSON.parse(lastLine);
    expect(receipt).toMatchObject({result:"passed",tables:11,issuanceRestored:true,issuanceReplayIdempotent:true,receiptBindingRestored:true,oldReceiptBindingUnknown:true,modeRestored:true,oldSchemaUpgradePreserved:true});
  });
});
