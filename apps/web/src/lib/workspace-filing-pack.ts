import type { ReturnWorkspaceRecord, WorkspaceFilingPack } from "@tax-engine/contracts";
import { buildWorkspaceFilingPack } from "@tax-engine/engine/src/workspace-filing-pack";

export interface WorkspaceFilingPackDownload {
  filingPack: WorkspaceFilingPack;
  fileName: string;
  contents: string;
}

export function buildWorkspaceFilingPackDownload(
  workspace: ReturnWorkspaceRecord
): WorkspaceFilingPackDownload {
  const filingPack = buildWorkspaceFilingPack(workspace);

  return {
    filingPack,
    fileName: filingPack.manifest.downloadFileName,
    contents: `${JSON.stringify(filingPack, null, 2)}\n`
  };
}
