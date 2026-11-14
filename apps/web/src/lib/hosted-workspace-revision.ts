import type { ReturnWorkspaceRecord } from "@tax-engine/contracts";

const revisionPattern = /^"[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}"$/u;
export const hostedWorkspaceConflictCode = "HOSTED_WORKSPACE_REVISION_CONFLICT";
export const hostedWorkspacePreconditionCode = "HOSTED_WORKSPACE_REVISION_REQUIRED";

export interface VersionedHostedWorkspace {
  workspace: ReturnWorkspaceRecord;
  revision: string;
}

export type HostedWorkspaceWritePrecondition =
  | { kind: "create" }
  | { kind: "update"; revision: string };

export function parseHostedWorkspaceRevision(value: unknown) {
  return typeof value === "string" && revisionPattern.test(value) ? value.slice(1, -1) : null;
}

export function readHostedWorkspaceRevision(headers: Headers, header: "ETag" | "If-Match") {
  return parseHostedWorkspaceRevision(headers.get(header));
}

/** This app explicitly declined the write before persisting the snapshot. */
export class HostedWorkspaceWriteRejectedError extends Error {
  constructor() {
    super("This return may have changed in another session. Reopen it before saving your changes.");
    this.name = "HostedWorkspaceWriteRejectedError";
  }
}
