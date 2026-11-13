import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
const url=process.env.TAX_ENGINE_TEST_AI_LEDGER_DATABASE_URL;
// Spec: federal/hosted-ai-credit-issuance.yaml. Disposable source-validated cluster only.
describe.skipIf(!url)("AI credit issuance backup and migration",()=>{
  it("restores original issuance and migrates an actual pre-issuance archive",()=>{
    const result=spawnSync(process.execPath,["--import","tsx","scripts/rehearse-hosted-recovery.ts"],{encoding:"utf8",timeout:4500,env:{...process.env,TSX_TSCONFIG_PATH:resolve("apps/web/tsconfig.json")}});
    expect(result.error).toBeUndefined();expect(result.status,result.stderr).toBe(0);
    const lastLine=result.stdout.trim().split("\n").at(-1);
    if(!lastLine) throw new Error("Recovery rehearsal did not emit its receipt.");
    const receipt=JSON.parse(lastLine);
    expect(receipt).toMatchObject({result:"passed",tables:10,issuanceRestored:true,issuanceReplayIdempotent:true,oldSchemaUpgradePreserved:true});
  });
});
