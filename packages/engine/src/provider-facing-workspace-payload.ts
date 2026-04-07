import type {
  ProviderFacingWorkspacePayload,
  ReturnWorkspaceRecord
} from "@tax-engine/contracts";
import {
  type BuildProviderPayloadOptions,
  redactProviderPayload
} from "./provider-payload-redactor";
import { buildWorkspaceUnsupportedRoutes } from "./workspace-unsupported-routes";

export function buildProviderFacingWorkspacePayload(
  workspace: ReturnWorkspaceRecord,
  options: BuildProviderPayloadOptions = {}
): ProviderFacingWorkspacePayload {
  const { payload, redactions, replacementCount } = redactProviderPayload(workspace, options);

  return {
    workspace: payload,
    unsupportedRoutes: buildWorkspaceUnsupportedRoutes(payload),
    redactions,
    replacementCount
  };
}
