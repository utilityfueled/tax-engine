"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { ReturnWorkspaceRecord, WorkspaceDeploymentMode } from "@tax-engine/contracts";
import { RetroShell } from "@/components/retro-shell";
import {
  deletePersistedWorkspace,
  listPersistedWorkspaces
} from "@/lib/workspace-persistence";
import { requireBrowserStorage } from "@/lib/browser-storage";
import { formatWorkspaceDocumentSummary } from "@/lib/document-fixture-copy";
import { loadGuidedFlowState } from "@/lib/guided-interview-flow";
import {
  countGuidedSyntheticDocuments,
  countUploadedDocuments,
  formatUnsupportedTaxYearNotice,
  formatWorkspaceTaxYearSummary,
  hasUnsupportedTaxYear,
  isUntouchedWorkspaceShell,
  summarizeWorkspaceGuidedCompletion,
  summarizeGuidedSetupProgress
} from "@/lib/workspace-status-copy";

function formatUpdatedAt(value: string) {
  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return "timestamp unavailable";
  }

  return parsed.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}

const returnStatusLabels: Record<string, string> = {
  "empty": "Empty",
  "ready-for-interview": "Ready to continue",
  "needs-review": "Needs review",
  "awaiting-interview": "Questions remaining",
  "ready-to-recompute": "Ready to review"
};

function formatStatusLabel(status: string) {
  return returnStatusLabels[status] ?? status;
}

function resolveUiErrorMessage(error: unknown, fallbackMessage: string) {
  return error instanceof Error && error.message.trim().length > 0
    ? error.message
    : fallbackMessage;
}

const MAX_VISIBLE_WORKSPACES = 4;

interface DisplayedWorkspace {
  workspace: ReturnWorkspaceRecord;
  guidedSetupProgress: ReturnType<typeof summarizeGuidedSetupProgress>;
}

function buildDisplayedWorkspaces(
  workspaces: ReturnWorkspaceRecord[],
  browserStorage: Storage
): DisplayedWorkspace[] {
  return workspaces.flatMap((workspace) => {
    const guidedSetupProgress = workspace.summary.totalDocuments === 0
      && workspace.seededReturn.status === "empty"
      ? summarizeGuidedSetupProgress(loadGuidedFlowState(browserStorage, workspace.id))
      : null;

    if (isUntouchedWorkspaceShell(workspace) && guidedSetupProgress === null) {
      return [];
    }

    return [{
      workspace,
      guidedSetupProgress
    }];
  });
}

export function buildWorkspaceHref(
  workspace: ReturnWorkspaceRecord,
  deploymentMode: WorkspaceDeploymentMode
) {
  return deploymentMode === "self-host" || workspace.storageMode === "local-browser"
    ? `/returns/${workspace.id}?local=1`
    : `/returns/${workspace.id}`;
}

export function RecentWorkspacesPanel({
  deploymentMode,
  newWorkspaceHref = "/returns/new"
}: {
  deploymentMode: WorkspaceDeploymentMode;
  newWorkspaceHref?: string;
}) {
  const [workspaces, setWorkspaces] = useState<DisplayedWorkspace[]>([]);
  const [storageMessage, setStorageMessage] = useState<string | null>(null);
  const [showAllWorkspaces, setShowAllWorkspaces] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const browserStorage = requireBrowserStorage();
        const { adapter, workspaces: nextWorkspaces } = await listPersistedWorkspaces({
          deploymentMode,
          browserStorage
        });

        const displayedWorkspaces = buildDisplayedWorkspaces(nextWorkspaces, browserStorage);

        setWorkspaces(displayedWorkspaces);
        setShowAllWorkspaces((current) => current && displayedWorkspaces.length > MAX_VISIBLE_WORKSPACES);
        setStorageMessage(
          adapter.availability === "owner-required"
            ? "Sign in to see your saved returns."
            : null
        );
      } catch (error) {
        setStorageMessage(
          deploymentMode === "hosted"
            ? resolveUiErrorMessage(
                error,
                "Could not connect to the server. Please try again later."
              )
            : "Browser storage is unavailable in this environment."
        );
      }
    })();
  }, [deploymentMode]);

  function removeWorkspace(workspaceId: string) {
    void (async () => {
      try {
        const browserStorage = requireBrowserStorage();
        const { workspaces: nextWorkspaces } = await deletePersistedWorkspace({
          deploymentMode,
          browserStorage,
          workspaceId
        });

        const displayedWorkspaces = buildDisplayedWorkspaces(nextWorkspaces, browserStorage);

        setWorkspaces(displayedWorkspaces);
        setShowAllWorkspaces((current) => current && displayedWorkspaces.length > MAX_VISIBLE_WORKSPACES);
        setStorageMessage(`Deleted return ${workspaceId}.`);
      } catch (error) {
        setStorageMessage(
          deploymentMode === "hosted"
            ? resolveUiErrorMessage(
                error,
                "Could not delete the return. Please try again."
              )
            : "Could not delete the return. Please try again."
        );
      }
    })();
  }

  const visibleWorkspaces = showAllWorkspaces
    ? workspaces
    : workspaces.slice(0, MAX_VISIBLE_WORKSPACES);
  const hiddenWorkspaceCount = Math.max(0, workspaces.length - visibleWorkspaces.length);

  return (
    <RetroShell
      title="Your Returns"
      eyebrow={deploymentMode === "hosted" ? "SAVED RETURNS" : "SAVED LOCALLY"}
    >
      {workspaces.length === 0 ? (
        <p className="panel-text">
          {deploymentMode === "hosted"
            ? "Your saved returns will appear here after you sign in."
            : "No saved returns yet. Start one now and it will appear here after you answer a question or upload a document."}
        </p>
      ) : (
        <>
          {workspaces.length > MAX_VISIBLE_WORKSPACES ? (
            <p className="document-meta">
              Showing {visibleWorkspaces.length} most recent of {workspaces.length} saved returns.
            </p>
          ) : null}
          <ul className="workspace-list" role="list">
            {visibleWorkspaces.map(({ workspace, guidedSetupProgress }) => {
              const unsupportedTaxYear = hasUnsupportedTaxYear(workspace.returnSummary);
              const unsupportedTaxYearNotice = formatUnsupportedTaxYearNotice(workspace.returnSummary);
              const guidedCompletionStatus = summarizeWorkspaceGuidedCompletion(workspace.guidedCompletion);
              const uploadedDocumentCount = countUploadedDocuments(workspace.documents);
              const guidedDocumentCount = countGuidedSyntheticDocuments(workspace.documents);
              const workspaceCountLabel = guidedDocumentCount > 0 && uploadedDocumentCount === 0
                ? "guided answers saved"
                : `${uploadedDocumentCount} doc${uploadedDocumentCount === 1 ? "" : "s"}`;

              return (
                <li className="workspace-card" key={workspace.id}>
                  <div className="workspace-card-top">
                    <div>
                      <strong>Tax Return {workspace.id}</strong>
                      <p className="document-meta">
                        updated {formatUpdatedAt(workspace.updatedAt)} · {workspaceCountLabel}
                      </p>
                    </div>
                    <span className={`status-pill workspace-card-status status-${
                      guidedSetupProgress
                        ? "ready-for-interview"
                        : guidedCompletionStatus
                          ? "needs-review"
                        : unsupportedTaxYear
                          ? "needs-review"
                          : workspace.returnSummary.status
                    }`}>
                      {guidedCompletionStatus?.statusLabel
                        ?? guidedSetupProgress?.statusLabel
                        ?? (unsupportedTaxYear ? "Unsupported year" : formatStatusLabel(workspace.returnSummary.status))}
                    </span>
                  </div>
                  {guidedSetupProgress ? (
                    <>
                      <p className="document-meta">{guidedSetupProgress.progressLabel}</p>
                      <p className="document-meta">{guidedSetupProgress.helperText}</p>
                    </>
                  ) : guidedCompletionStatus ? (
                    <>
                      <p className="document-meta">{guidedCompletionStatus.progressLabel}</p>
                      <p className="document-meta">{guidedCompletionStatus.helperText}</p>
                    </>
                  ) : (
                    <>
                      <p className="document-meta">
                        {formatWorkspaceDocumentSummary(
                          workspace.summary.totalDocuments,
                          workspace.summary.officialFixtureMatches,
                          workspace.summary.pendingReviewDocuments
                        )}
                      </p>
                      <p className="document-meta">
                        tax year: {formatWorkspaceTaxYearSummary(workspace.returnSummary)}
                      </p>
                    </>
                  )}
                  {unsupportedTaxYearNotice ? (
                    <p className="document-meta">{unsupportedTaxYearNotice}</p>
                  ) : null}
                  <div className="workspace-actions">
                    <Link
                      className="utility-button workspace-link"
                      href={buildWorkspaceHref(workspace, deploymentMode)}
                      aria-label={`Continue tax return ${workspace.id}`}
                    >
                      Continue Return
                    </Link>
                    <button
                      className="utility-button utility-button-small"
                      type="button"
                      onClick={() => {
                        removeWorkspace(workspace.id);
                      }}
                      aria-label={`Delete tax return ${workspace.id}`}
                    >
                      Delete
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
          <div className="workspace-actions" style={{ marginTop: "12px" }}>
            {workspaces.length > MAX_VISIBLE_WORKSPACES ? (
              <button
                className="utility-button utility-button-small"
                type="button"
                onClick={() => {
                  setShowAllWorkspaces((current) => !current);
                }}
              >
                {showAllWorkspaces
                  ? `Show only the latest ${MAX_VISIBLE_WORKSPACES} returns`
                  : `Show ${hiddenWorkspaceCount} older return${hiddenWorkspaceCount === 1 ? "" : "s"}`}
              </button>
            ) : null}
            <Link className="utility-button workspace-link" href={newWorkspaceHref}>
              Start New Return
            </Link>
          </div>
        </>
      )}
      <p
        className="status-inline"
        role="status"
        aria-live="polite"
        aria-label="Saved returns status"
      >
        {storageMessage ?? `${workspaces.length} saved return${workspaces.length === 1 ? "" : "s"}.`}
      </p>
    </RetroShell>
  );
}
