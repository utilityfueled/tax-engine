import { randomUUID } from "node:crypto";
import type { HostedWorkspaceEntryGate } from "@/lib/hosted-auth";
import {
  getHostedWorkspaceEntryGate,
  resolveHostedWorkspaceActor,
  shouldAllowLocalWorkspaceDraftBypass
} from "@/lib/hosted-auth";
import { resolveDeploymentMode } from "@/lib/deployment-mode";
import { createWorkspacePersistenceAdapter } from "@/lib/workspace-persistence";
import { createWorkspaceRecord } from "@/lib/workspace-storage";
import { createHostedPostgresWorkspaceStoreFactory } from "@/lib/hosted-postgres-workspace-store";

export function buildNewWorkspaceRedirectPath(
  workspaceId: string,
  {
    localDraft = false
  }: {
    localDraft?: boolean;
  } = {}
) {
  return localDraft
    ? `/returns/${workspaceId}?create=1&local=1`
    : `/returns/${workspaceId}?create=1`;
}

export function buildNewWorkspaceEntryPath({
  localDraft = false
}: {
  localDraft?: boolean;
} = {}) {
  return localDraft ? "/returns/new?local=1" : "/returns/new";
}

export async function resolveNewWorkspaceEntry({
  env = process.env,
  createWorkspaceId = () => randomUUID().slice(0, 8),
  requestHeaders,
  localDraftRequested = false
}: {
  env?: Record<string, string | undefined>;
  createWorkspaceId?: () => string;
  requestHeaders?: Headers;
  localDraftRequested?: boolean;
} = {}): Promise<
  | {
      kind: "redirect";
      location: string;
    }
  | {
      kind: "gate";
      gate: HostedWorkspaceEntryGate;
    }
> {
  const gate = await getHostedWorkspaceEntryGate({
    env,
    requestHeaders,
    localDraftRequested
  });

  if (gate.canCreateWorkspace) {
    const workspaceId = createWorkspaceId();
    const shouldUseLocalDraftBypass = shouldAllowLocalWorkspaceDraftBypass({
      env,
      requestHeaders,
      localDraftRequested
    });

    if (resolveDeploymentMode(env) === "hosted" && requestHeaders && !shouldUseLocalDraftBypass) {
      const actor = await resolveHostedWorkspaceActor({
        env,
        requestHeaders
      });

      if (actor) {
        try {
          const hostedStoreFactory = env.TAX_ENGINE_HOSTED_PERSISTENCE_BACKEND?.trim().toLowerCase() === "postgres-s3"
            ? createHostedPostgresWorkspaceStoreFactory(env)
            : undefined;
          const adapter = await createWorkspacePersistenceAdapter({
            env,
            actor,
            hostedStoreFactory
          });

          await adapter.saveWorkspace(
            createWorkspaceRecord(workspaceId, {
              now: new Date().toISOString(),
              storageMode: "hosted-postgres",
              createdMessage: "Return created."
            })
          );
        } catch {
          return {
            kind: "gate",
            gate: {
              ...gate,
              canCreateWorkspace: false,
              title: "Hosted workspace storage is unavailable",
              summary:
                "Your account is active, but durable hosted workspace storage is not configured yet. " +
                "Please contact the administrator before creating a hosted return.",
              statusNotes: [
                actor.label
                  ? `Signed in as ${actor.label}.`
                  : "Your account session is active.",
                "Hosted workspace storage must be configured before new returns can be created.",
                "Billing remains available, but hosted return creation is temporarily disabled."
              ],
              primaryActionHref: "/billing",
              primaryActionLabel: "Open Billing"
            }
          };
        }
      }
    }

    return {
      kind: "redirect",
      location: buildNewWorkspaceRedirectPath(workspaceId, {
        localDraft: shouldUseLocalDraftBypass
      })
    };
  }

  return {
    kind: "gate",
    gate
  };
}
