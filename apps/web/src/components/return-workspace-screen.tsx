"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type {
  ProviderFacingPayloadRedaction,
  ReturnWorkspaceRecord,
  WorkspaceDeploymentMode
} from "@tax-engine/contracts";
import { buildWorkspaceUnsupportedRoutes } from "@tax-engine/engine";
import { StateReturnPanel } from "@/components/confidence-tier";
import { DeploymentModePanel } from "@/components/deployment-mode-panel";
import { GuidedInterviewShell } from "@/components/guided-interview/guided-interview-shell";
import { ReturnHelpDock } from "@/components/return-help-dock";
import { RefundTicker } from "@/components/refund-ticker";
import type { RefundTickerPreviewData } from "@/components/refund-ticker";
import { RetroShell } from "@/components/retro-shell";
import { buildDeploymentModeViewModel } from "@/lib/deployment-mode";
import {
  formatFixtureDocumentCount,
  formatMatchedDocumentStatus,
  formatStructuredFactSourceType,
} from "@/lib/document-fixture-copy";
import { formatStructuredFactConfidence } from "@/lib/structured-fact-copy";
import {
  canPresentCompletedReturnDownload,
  countGuidedSyntheticDocuments,
  countUploadedDocuments,
  countUploadedSupportedDocuments,
  formatDocumentCoverageLabel,
  formatDocumentCoverageNote,
  formatUnsupportedTaxYearNotice,
  formatWorkspaceCalculationStatus,
  formatWorkspaceTaxYearSummary,
  hasBlockingWorkspaceActions,
  hasUnsupportedTaxYear,
  summarizePendingInterviewQuestions,
  summarizeWorkspaceGuidedCompletion,
  summarizeGuidedSetupProgress
} from "@/lib/workspace-status-copy";
import {
  collectGuidedReviewIssues,
  loadGuidedFlowState,
  type GuidedFlowState,
  type GuidedReviewIssue,
  type InterviewSectionId,
} from "@/lib/guided-interview-flow";
import { mapFilingStatus } from "@/lib/guided-interview-bridge";
import { computeGuidedPreview } from "@/lib/guided-preview-compute";
import { getInterviewQuestionUiHint } from "@/lib/interview-question-ui";
import {
  ProviderWorkspaceRequestError,
  requestProviderWorkspace,
  type ProviderWorkspaceResponse
} from "@/lib/provider-workspace-request";
import { prepareUploadableFiles } from "@/lib/uploaded-document-detection";
import { DocumentTaxYearField } from "./document-tax-year-field";
import { cacheWorkspaceDocumentFiles, deleteCachedWorkspaceDocumentFiles } from "@/lib/workspace-document-file-cache";
import {
  answerInterviewQuestion,
  answerWorkspaceInterviewQuestion,
  clearWorkspace,
  clearWorkspaceRecord,
  confirmWorkspaceDocumentTaxYear,
  getFutureYearSampleUploadMessage,
  ingestFiles,
  ingestFilesIntoWorkspace,
  removeDocument,
  removeDocumentFromWorkspace,
  reopenWorkspaceInterviewQuestion,
  reopenInterviewQuestion,
  seededFactLabels,
  syncGuidedFlowToWorkspace
} from "@/lib/workspace-storage";
import { buildWorkspaceFilingPackDownload } from "@/lib/workspace-filing-pack";
import { buildProviderPartnerReviewRequestDownload } from "@/lib/partner-review-request";
import {
  loadPersistedWorkspace,
  savePersistedWorkspace,
} from "@/lib/workspace-persistence";
import { getBrowserStorage, requireBrowserStorage } from "@/lib/browser-storage";
import { isLoopbackHostname } from "@/lib/hosted-runtime-safety";

function formatDocumentTrace(
  documentIds: string[],
  documentsById: Map<string, ReturnWorkspaceRecord["documents"][number]>
) {
  return documentIds.map((documentId) => {
    const document = documentsById.get(documentId);

    if (!document) {
      return {
        id: documentId,
        displayLabel: documentId
      };
    }

    return {
      id: documentId,
      displayLabel: `${document.label} · ${document.name}`
    };
  });
}

function formatStructuredFactTrace(
  factIds: string[],
  structuredFactsById: Map<string, ReturnWorkspaceRecord["structuredFacts"][number]>
) {
  return factIds.map((factId) => {
    const fact = structuredFactsById.get(factId);

    if (!fact) {
      return {
        id: factId,
        displayLabel: factId
      };
    }

    return {
      id: factId,
      displayLabel: `${fact.label} · ${formatDocumentKind(fact.kind)}`
    };
  });
}

function formatCurrencyString(value: string) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0
  }).format(Number(value));
}

const documentKindLabels: Record<string, string> = {
  "w2": "W-2",
  "1099-int": "1099-INT",
  "1099-g": "1099-G",
  "1099-oid": "1099-OID",
  "1099-div": "1099-DIV",
  "1099-b": "1099-B",
  "1095-a": "1095-A",
  "1098-e": "1098-E",
  "1099-r": "1099-R",
  "ssa-1099": "SSA-1099",
  "1099-sa": "1099-SA",
  "1099-nec": "1099-NEC",
  "1099-da": "1099-DA",
  "schedule-c-support": "Schedule C",
  "training-scenario": "Training Scenario"
};

function formatDocumentKind(kind: string) {
  return documentKindLabels[kind] ?? kind.replace(/-/g, " ").toUpperCase();
}

const legacyGuidedModeStorageKey = "tax-engine:guided-mode";

function getWorkspaceGuidedModeStorageKey(workspaceId: string) {
  return `tax-engine:guided-mode:${workspaceId}`;
}

function readGuidedModePreference(
  storage: Storage,
  workspaceId: string
) {
  const workspacePreference = storage.getItem(getWorkspaceGuidedModeStorageKey(workspaceId));

  if (workspacePreference === "true") {
    return true;
  }

  if (workspacePreference === "false") {
    return false;
  }

  const legacyPreference = storage.getItem(legacyGuidedModeStorageKey);

  if (legacyPreference === "true" || legacyPreference === "false") {
    storage.setItem(getWorkspaceGuidedModeStorageKey(workspaceId), legacyPreference);
    storage.removeItem(legacyGuidedModeStorageKey);
    return legacyPreference !== "false";
  }

  return true;
}

function formatSourceType(sourceType: string) {
  return formatStructuredFactSourceType(sourceType);
}

interface ProviderSummaryRun {
  requestId: string;
  response: ProviderWorkspaceResponse;
  redactions: ProviderFacingPayloadRedaction[];
}

interface PartnerReviewConsentDraft {
  shareRedactedDataWithPartner: boolean;
  acknowledgeSoftwareOnlyService: boolean;
  acknowledgeSeparateProfessionalEngagement: boolean;
}

interface PartnerReviewDownloadRun {
  requestId: string;
  requestedAt: string;
  fileName: string;
  replacementCount: number;
  redactions: ProviderFacingPayloadRedaction[];
}

const protectedDetailKindLabels: Record<ProviderFacingPayloadRedaction["kind"], string> = {
  "person-name": "Name",
  "ssn": "SSN",
  "email": "Email",
  "phone": "Phone number",
  "street-address": "Street address",
  "postal-code": "Postal code",
  "date-of-birth": "Date of birth",
  "other": "Other identifier"
};

function summarizeProtectedDetails(redactions: ProviderFacingPayloadRedaction[]) {
  const countsByKind = new Map<ProviderFacingPayloadRedaction["kind"], number>();

  for (const redaction of redactions) {
    countsByKind.set(redaction.kind, (countsByKind.get(redaction.kind) ?? 0) + 1);
  }

  return [
    "person-name",
    "ssn",
    "email",
    "phone",
    "street-address",
    "postal-code",
    "date-of-birth",
    "other"
  ].flatMap((kind) => {
    const count = countsByKind.get(kind as ProviderFacingPayloadRedaction["kind"]) ?? 0;

    if (count === 0) {
      return [];
    }

    const label = protectedDetailKindLabels[kind as ProviderFacingPayloadRedaction["kind"]];
    return [`${label}${count === 1 ? "" : "s"} (${count})`];
  });
}

const auditEventKindLabels: Record<string, string> = {
  "workspace-created": "Return started",
  "documents-ingested": "Documents uploaded",
  "document-removed": "Document removed",
  "workspace-cleared": "Return reset",
  "interview-answered": "Question answered",
  "interview-reopened": "Question reopened"
};

function formatAuditEventKindLabel(kind: string) {
  return auditEventKindLabels[kind] ?? kind;
}

const returnStatusLabels: Record<string, string> = {
  "empty": "Empty",
  "ready-for-interview": "Ready to continue",
  "needs-review": "Needs review",
  "awaiting-interview": "Questions remaining",
  "ready-to-recompute": "Ready to review"
};

function formatStatusLabel(status: string) {
  return returnStatusLabels[status] ?? formatPillLabel(status);
}

function formatPillLabel(value: string) {
  return value.replace(/-/g, " ");
}

function formatUploadedDocumentHeadline(uploadedDocumentCount: number, guidedDocumentCount: number) {
  if (guidedDocumentCount === 0) {
    return `${uploadedDocumentCount} document${uploadedDocumentCount === 1 ? "" : "s"} uploaded`;
  }

  if (uploadedDocumentCount === 0) {
    return "Guided answers synced";
  }

  return `${uploadedDocumentCount} upload${uploadedDocumentCount === 1 ? "" : "s"} + guided answers synced`;
}

function formatStoredDocumentSummary(
  uploadedDocumentCount: number,
  storageMode: ReturnWorkspaceRecord["storageMode"]
) {
  return `${uploadedDocumentCount} uploaded document${uploadedDocumentCount === 1 ? "" : "s"} ${
    storageMode === "hosted-postgres"
      ? "processed for this device and reduced to a hosted workspace shell"
      : "stored locally"
  }`;
}

function formatDocumentStatusMessage(
  uploadedDocumentCount: number,
  guidedDocumentCount: number,
  storageMode: ReturnWorkspaceRecord["storageMode"]
) {
  if (uploadedDocumentCount > 0) {
    return formatStoredDocumentSummary(uploadedDocumentCount, storageMode);
  }

  if (guidedDocumentCount > 0) {
    return "Guided answers synced from the interview.";
  }

  return "No uploads yet.";
}

const defaultPartnerReviewConsent: PartnerReviewConsentDraft = {
  shareRedactedDataWithPartner: false,
  acknowledgeSoftwareOnlyService: false,
  acknowledgeSeparateProfessionalEngagement: false
};

function jumpToPanel(panelId: string) {
  document.getElementById(panelId)?.scrollIntoView({
    behavior: "smooth",
    block: "start"
  });
}

function resolveUiErrorMessage(error: unknown, fallbackMessage: string) {
  return error instanceof Error && error.message.trim().length > 0
    ? error.message
    : fallbackMessage;
}

function resolveProviderSummaryErrorMessage(error: unknown) {
  if (error instanceof ProviderWorkspaceRequestError) {
    if (error.code === "auth_required") {
      return "Sign in and choose a paid plan to use the AI summary.";
    }

    if (error.code === "paid_plan_required") {
      return "The AI summary is available on paid hosted plans only.";
    }

    if (error.code === "ai_budget_exhausted") {
      return "Your included AI helper budget is exhausted. Buy more AI credits in Billing to continue.";
    }

    if (error.code === "ai_provider_unavailable") {
      return "The AI summary provider is not configured right now.";
    }
  }

  return resolveUiErrorMessage(error, "Could not generate the AI summary. Please try again.");
}

const filingPackFileLabels: Record<string, string> = {
  "00-manifest.json": "Download manifest",
  "01-return-summary.json": "Return summary",
  "02-supporting-forms.json": "Supporting forms data",
  "03-checklist.json": "Completion checklist",
  "04-filing-instructions.txt": "Filing instructions",
  "05-missing-items-memo.txt": "Items needing attention",
  "06-unsupported-situations.txt": "Situations to review outside this product",
  "07-audit-trail.json": "Activity log"
};

function formatFilingPackFileName(path: string) {
  return filingPackFileLabels[path] ?? path;
}

function triggerBrowserDownload(fileName: string, contents: BlobPart | readonly BlobPart[], mediaType: string) {
  const blobParts = Array.isArray(contents) ? contents : [contents];
  const objectUrl = window.URL.createObjectURL(new Blob(blobParts, {
    type: mediaType
  }));
  const link = document.createElement("a");

  link.href = objectUrl;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => {
    window.URL.revokeObjectURL(objectUrl);
  }, 0);
}

function resolveDownloadFileName(
  headers: Headers,
  fallbackFileName: string
) {
  const contentDisposition = headers.get("content-disposition");
  const fileNameMatch = contentDisposition?.match(/filename="?([^"]+)"?/i);

  return fileNameMatch?.[1] ?? fallbackFileName;
}

export function ReturnWorkspaceScreen({
  workspaceId,
  createIfMissing = false,
  deploymentMode
}: {
  workspaceId: string;
  createIfMissing?: boolean;
  deploymentMode: WorkspaceDeploymentMode;
}) {
  const [workspace, setWorkspace] = useState<ReturnWorkspaceRecord | null>(null);
  const [workspaceLookupComplete, setWorkspaceLookupComplete] = useState(false);
  const [workspaceAvailability, setWorkspaceAvailability] = useState<"ready" | "owner-required">("ready");
  const [effectiveDeploymentMode, setEffectiveDeploymentMode] = useState<WorkspaceDeploymentMode>(deploymentMode);
  const [storageMessage, setStorageMessage] = useState<string | null>(null);
  const [answerDrafts, setAnswerDrafts] = useState<Record<string, string>>({});
  const [providerSummaryRun, setProviderSummaryRun] = useState<ProviderSummaryRun | null>(null);
  const [providerSummaryPending, setProviderSummaryPending] = useState(false);
  const [providerSummaryError, setProviderSummaryError] = useState<string | null>(null);
  const [filledReturnPending, setFilledReturnPending] = useState(false);
  const [partnerReviewConsent, setPartnerReviewConsent] = useState<PartnerReviewConsentDraft>(
    defaultPartnerReviewConsent
  );
  const [partnerReviewDownloadRun, setPartnerReviewDownloadRun] = useState<PartnerReviewDownloadRun | null>(null);
  const [persistedGuidedFlowState, setPersistedGuidedFlowState] = useState<GuidedFlowState | null>(null);
  const [guidedFallbackPreview, setGuidedFallbackPreview] = useState<RefundTickerPreviewData | null>(null);
  const [guidedResumeSectionId, setGuidedResumeSectionId] = useState<InterviewSectionId | null>(null);
  const [guidedReviewIssues, setGuidedReviewIssues] = useState<GuidedReviewIssue[]>([]);
  const [guidedReviewSummary, setGuidedReviewSummary] = useState<string | null>(null);
  const [guidedMode, setGuidedModeRaw] = useState(() => {
    const browserStorage = getBrowserStorage();
    return browserStorage ? readGuidedModePreference(browserStorage, workspaceId) : true;
  });
  function setGuidedMode(value: boolean) {
    setGuidedModeRaw(value);
    const browserStorage = getBrowserStorage();

    if (browserStorage) {
      browserStorage.setItem(getWorkspaceGuidedModeStorageKey(workspaceId), String(value));
    }
  }
  const localWorkspaceEditingEnabled = effectiveDeploymentMode === "self-host";

  useEffect(() => {
    setEffectiveDeploymentMode(deploymentMode);
  }, [deploymentMode]);

  useEffect(() => {
    const browserStorage = getBrowserStorage();
    setGuidedModeRaw(browserStorage ? readGuidedModePreference(browserStorage, workspaceId) : true);
  }, [workspaceId]);


  async function persistHostedWorkspace(nextWorkspace: ReturnWorkspaceRecord) {
    const browserStorage = requireBrowserStorage();
    const { adapter, workspace: savedWorkspace } = await savePersistedWorkspace({
      deploymentMode: effectiveDeploymentMode,
      workspace: nextWorkspace,
      browserStorage
    });

    setWorkspaceAvailability(adapter.availability);
    setWorkspace(savedWorkspace);
    return savedWorkspace;
  }

  useEffect(() => {
    void (async () => {
      try {
        const browserStorage = requireBrowserStorage();

        if (
          deploymentMode === "hosted"
          && process.env.NODE_ENV !== "production"
          && isLoopbackHostname(window.location.hostname)
        ) {
          const { getWorkspace: getLocalWorkspace } = await import("@/lib/workspace-storage");
          const localWorkspace = getLocalWorkspace(browserStorage, workspaceId);

          if (localWorkspace) {
            setEffectiveDeploymentMode("self-host");
            setWorkspaceAvailability("ready");
            setWorkspace(localWorkspace);
            setWorkspaceLookupComplete(true);
            setStorageMessage(null);

            if (createIfMissing) {
              window.history.replaceState(null, "", `/returns/${workspaceId}`);
            }

            return;
          }
        }

        const { adapter, workspace: nextWorkspace } = await loadPersistedWorkspace({
          deploymentMode,
          browserStorage,
          workspaceId,
          createIfMissing
        });

        setEffectiveDeploymentMode(deploymentMode);
        setWorkspaceAvailability(adapter.availability);
        setWorkspace(nextWorkspace);
        setWorkspaceLookupComplete(true);
        setStorageMessage(
          adapter.availability === "owner-required"
            ? "Sign in to load your saved return."
            : null
        );

        if (nextWorkspace && createIfMissing) {
          window.history.replaceState(null, "", `/returns/${workspaceId}`);
        }
      } catch (error) {
        setWorkspaceLookupComplete(true);
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
  }, [createIfMissing, deploymentMode, workspaceId]);

  useEffect(() => {
    if (!workspace) {
      return;
    }

    setAnswerDrafts(
      Object.fromEntries(
        workspace.seededReturn.interviewQuestions.map((question) => [
          question.id,
          question.answerText ?? ""
        ])
      )
    );
  }, [workspace]);

  useEffect(() => {
    setProviderSummaryRun(null);
    setProviderSummaryPending(false);
    setProviderSummaryError(null);
    setPartnerReviewConsent(defaultPartnerReviewConsent);
    setPartnerReviewDownloadRun(null);
  }, [workspace?.updatedAt]);

  useEffect(() => {
    if (!workspace) {
      setPersistedGuidedFlowState(null);
      setGuidedFallbackPreview(null);
      setGuidedReviewIssues([]);
      setGuidedReviewSummary(null);
      return;
    }

    const browserStorage = getBrowserStorage();

    if (!browserStorage) {
      setPersistedGuidedFlowState(null);
      setGuidedFallbackPreview(null);
      setGuidedReviewIssues([]);
      setGuidedReviewSummary(null);
      return;
    }

    const nextGuidedFlowState = loadGuidedFlowState(browserStorage, workspace.id);
    setPersistedGuidedFlowState(nextGuidedFlowState);
    setGuidedReviewIssues(nextGuidedFlowState ? collectGuidedReviewIssues(nextGuidedFlowState) : []);

    if (
      workspace.enginePreview
      || (
        workspace.returnSummary.status !== "ready-to-recompute"
        && workspace.returnSummary.status !== "awaiting-interview"
      )
      || workspace.returnSummary.targetTaxYear === null
      || !nextGuidedFlowState
      || nextGuidedFlowState.taxYear !== workspace.returnSummary.targetTaxYear
      || nextGuidedFlowState.segmentation.filingStatus === null
    ) {
      setGuidedFallbackPreview(null);
      return;
    }

    const guidedPreview = computeGuidedPreview(nextGuidedFlowState);

    if (!guidedPreview) {
      setGuidedFallbackPreview(null);
      return;
    }

    setGuidedFallbackPreview({
      filingStatus: mapFilingStatus(nextGuidedFlowState.segmentation.filingStatus as NonNullable<GuidedFlowState["segmentation"]["filingStatus"]>),
      taxYear: workspace.returnSummary.targetTaxYear,
      filingState: nextGuidedFlowState.segmentation.stateCode ?? undefined,
      metrics: {
        totalIncome: guidedPreview.totalIncome,
        agi: guidedPreview.agi,
        taxableIncome: guidedPreview.taxableIncome,
        totalTax: guidedPreview.totalTax,
        totalPayments: guidedPreview.totalPayments,
        refund: guidedPreview.refund,
        amountOwed: guidedPreview.amountOwed
      },
      stateMetrics: guidedPreview.state
        ? {
            stateCode: guidedPreview.state.stateCode,
            stateTax: guidedPreview.state.stateTax,
            totalPayments: guidedPreview.state.stateWithholding,
            refund: guidedPreview.state.stateRefund,
            amountOwed: guidedPreview.state.stateAmountOwed
          }
        : undefined
    });
  }, [workspace]);

  useEffect(() => {
    if (guidedReviewIssues.length === 0) {
      setGuidedReviewSummary(null);
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch("/api/guided-review-summary", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ issues: guidedReviewIssues }),
        });
        const payload = await response.json().catch(() => null) as { summary?: string } | null;
        if (!cancelled) {
          setGuidedReviewSummary(payload?.summary?.trim() || null);
        }
      } catch {
        if (!cancelled) {
          setGuidedReviewSummary(null);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [guidedReviewIssues]);

  async function uploadFiles(files: File[]) {
    if (files.length === 0) {
      return "";
    }

    const preparedFiles = await prepareUploadableFiles(files);
    const futureYearSampleUploadMessage = getFutureYearSampleUploadMessage(preparedFiles);

    if (futureYearSampleUploadMessage) {
      setStorageMessage(futureYearSampleUploadMessage);
      throw new Error(futureYearSampleUploadMessage);
    }

    if (!localWorkspaceEditingEnabled) {
      if (!workspace) {
        const message = "Sign in to upload documents.";
        setStorageMessage(message);
        throw new Error(message);
      }

      try {
        const nextWorkspace = ingestFilesIntoWorkspace(workspace, preparedFiles);
        const appendedDocuments = nextWorkspace.documents.slice(-files.length);
        await cacheWorkspaceDocumentFiles(workspaceId, appendedDocuments.map((document, index) => {
          const file = files[index];

          if (!file) {
            throw new Error("Upload state lost track of a selected file.");
          }

          return {
            documentId: document.id,
            uploadedAt: document.uploadedAt,
            file,
          };
        }));
        const savedWorkspace = await persistHostedWorkspace(nextWorkspace);
        const message = `${savedWorkspace.summary.totalDocuments} documents processed. Raw files stay local and are not stored in durable hosted storage.`;

        setWorkspace(savedWorkspace);
        setStorageMessage(message);
        return message;
      } catch (error) {
        const message = resolveUiErrorMessage(
          error,
          "Could not save the uploaded document. Please try again."
        );
        setStorageMessage(message);
        throw new Error(message, { cause: error });
      }
    }

    try {
      const nextWorkspace = ingestFiles(requireBrowserStorage(), workspaceId, preparedFiles);
      const appendedDocuments = nextWorkspace.documents.slice(-files.length);
      await cacheWorkspaceDocumentFiles(workspaceId, appendedDocuments.map((document, index) => {
        const file = files[index];

        if (!file) {
          throw new Error("Upload state lost track of a selected file.");
        }

        return {
          documentId: document.id,
          uploadedAt: document.uploadedAt,
          file,
        };
      }));
      const message = `${nextWorkspace.summary.totalDocuments} docs stored locally.`;

      setWorkspace(nextWorkspace);
      setStorageMessage(message);
      return message;
    } catch (error) {
      const message = "Could not save the uploaded document. Please try again.";
      setStorageMessage(message);
      throw new Error(message, { cause: error });
    }
  }

  function syncUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);

    if (files.length === 0) {
      return;
    }

    void uploadFiles(files).catch(() => {
      // `uploadFiles` already records a user-facing message for the failure path.
    }).finally(() => {
      event.target.value = "";
    });
  }

  async function handleGuidedUpload(files: File[]) {
    try {
      return await uploadFiles(files);
    } finally {
      // Guided mode uses a separate hidden file input, so there is nothing to reset here.
    }
  }

  function resetWorkspace() {
    if (!localWorkspaceEditingEnabled) {
      if (!workspace) {
        setStorageMessage("Sign in to manage your return.");
        return;
      }

      void (async () => {
        try {
          await persistHostedWorkspace(clearWorkspaceRecord(workspace));
          await deleteCachedWorkspaceDocumentFiles(workspaceId);
          setStorageMessage("Return reset.");
        } catch (error) {
          setStorageMessage(resolveUiErrorMessage(error, "Could not reset the return. Please try again."));
        }
      })();
      return;
    }

    void (async () => {
      try {
        await deleteCachedWorkspaceDocumentFiles(workspaceId);
        const nextWorkspace = clearWorkspace(requireBrowserStorage(), workspaceId);
        setWorkspace(nextWorkspace);
        setStorageMessage("Return reset.");
      } catch {
        setStorageMessage("Could not reset the return. Please try again.");
      }
    })();
  }

  function removeWorkspaceDocument(documentId: string, documentLabel: string) {
    if (!localWorkspaceEditingEnabled) {
      if (!workspace) {
        setStorageMessage("Sign in to manage your documents.");
        return;
      }

      void (async () => {
        try {
          await persistHostedWorkspace(removeDocumentFromWorkspace(workspace, documentId));
          await deleteCachedWorkspaceDocumentFiles(workspaceId, [documentId]);
          setStorageMessage(`Removed ${documentLabel}.`);
        } catch (error) {
          setStorageMessage(resolveUiErrorMessage(error, "Could not remove the document. Please try again."));
        }
      })();
      return;
    }

    void (async () => {
      try {
        await deleteCachedWorkspaceDocumentFiles(workspaceId, [documentId]);
        const nextWorkspace = removeDocument(requireBrowserStorage(), workspaceId, documentId);
        setWorkspace(nextWorkspace);
        setStorageMessage(`Removed ${documentLabel}.`);
      } catch {
        setStorageMessage("Could not remove the document. Please try again.");
      }
    })();
  }

  async function confirmDocumentYear(documentId: string, year: number | null) {
    if (!workspace) throw new Error("The return is not available.");
    const nextWorkspace = confirmWorkspaceDocumentTaxYear(workspace, documentId, year);
    await persistHostedWorkspace(nextWorkspace);
    setStorageMessage("Document year saved. Review the related answers again.");
  }

  function markInterviewQuestionAnswered(
    questionId: ReturnWorkspaceRecord["seededReturn"]["interviewQuestions"][number]["id"],
    prompt: string,
    answerText: string
  ) {
    const normalizedAnswer = answerText.trim();

    if (normalizedAnswer.length === 0) {
      setStorageMessage(`Please enter your answer before saving: ${prompt}`);
      return;
    }

    if (!localWorkspaceEditingEnabled) {
      if (!workspace) {
        setStorageMessage("Sign in to save your answers.");
        return;
      }

      void (async () => {
        try {
          await persistHostedWorkspace(
            answerWorkspaceInterviewQuestion(workspace, questionId, normalizedAnswer)
          );
          setStorageMessage(`Answer saved: ${prompt}`);
        } catch (error) {
          setStorageMessage(resolveUiErrorMessage(error, "Could not save your answer. Please try again."));
        }
      })();
      return;
    }

    try {
      const nextWorkspace = answerInterviewQuestion(
        requireBrowserStorage(),
        workspaceId,
        questionId,
        normalizedAnswer
      );
      setWorkspace(nextWorkspace);
      setStorageMessage(`Answer saved: ${prompt}`);
    } catch {
      setStorageMessage("Could not save your answer. Please try again.");
    }
  }

  function reopenInterviewPrompt(
    questionId: ReturnWorkspaceRecord["seededReturn"]["interviewQuestions"][number]["id"],
    prompt: string
  ) {
    if (!localWorkspaceEditingEnabled) {
      if (!workspace) {
        setStorageMessage("Sign in to edit your answers.");
        return;
      }

      void (async () => {
        try {
          await persistHostedWorkspace(reopenWorkspaceInterviewQuestion(workspace, questionId));
          setStorageMessage(`Reopened question: ${prompt}`);
        } catch (error) {
          setStorageMessage(resolveUiErrorMessage(error, "Could not save your answer. Please try again."));
        }
      })();
      return;
    }

    try {
      const nextWorkspace = reopenInterviewQuestion(requireBrowserStorage(), workspaceId, questionId);
      setWorkspace(nextWorkspace);
      setStorageMessage(`Reopened question: ${prompt}`);
    } catch {
      setStorageMessage("Could not update the question. Please try again.");
    }
  }

  async function runProviderSummary() {
    if (!workspace) {
      return;
    }

    setProviderSummaryPending(true);
    setProviderSummaryError(null);

    try {
      const result = await requestProviderWorkspace(workspace, localWorkspaceEditingEnabled
        ? { workspaceStorageModeOverride: "local-browser" }
        : {});
      setProviderSummaryRun({
        requestId: result.request.requestId,
        response: result.response,
        redactions: result.request.redactions
      });
    } catch (error) {
      setProviderSummaryError(resolveProviderSummaryErrorMessage(error));
    } finally {
      setProviderSummaryPending(false);
    }
  }

  function downloadFilingPack() {
    if (!workspace) {
      return;
    }

    try {
      const filingPackDownload = buildWorkspaceFilingPackDownload(workspace);
      triggerBrowserDownload(
        filingPackDownload.fileName,
        filingPackDownload.contents,
        "application/json"
      );
      setStorageMessage(`Downloaded ${filingPackDownload.fileName} to your local device.`);
    } catch {
      setStorageMessage("Could not generate your completed return. Please try again.");
    }
  }

  async function downloadFilledReturnPdf() {
    if (!workspace) {
      return;
    }

    setFilledReturnPending(true);

    try {
      const response = await fetch("/api/workspace/filled-return", {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          workspace,
          guidedFlowState: persistedGuidedFlowState
        })
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null) as { error?: unknown } | null;
        throw new Error(
          typeof payload?.error === "string"
            ? payload.error
            : "Could not generate your filled return PDF."
        );
      }

      const fileName = resolveDownloadFileName(
        response.headers,
        `${workspace.id}-review-return.pdf`
      );
      const includedForms = response.headers
        .get("X-Tax-Engine-Included-Forms")
        ?.split(",")
        .filter(Boolean) ?? [];
      const contents = new Uint8Array(await response.arrayBuffer());

      triggerBrowserDownload(fileName, contents, "application/pdf");
      setStorageMessage(
        includedForms.length > 0
          ? `Downloaded ${fileName} as an experimental reference packet with ${includedForms.length} filled tax form${includedForms.length === 1 ? "" : "s"}. Review the cover page warnings before relying on it.`
          : `Downloaded ${fileName} as an experimental reference packet. Review the cover page warnings before relying on it.`
      );
    } catch (error) {
      setStorageMessage(
        resolveUiErrorMessage(
          error,
          "Could not generate your filled return PDF. Please try again."
        )
      );
    } finally {
      setFilledReturnPending(false);
    }
  }

  function setPartnerReviewConsentField(
    field: keyof PartnerReviewConsentDraft,
    value: boolean
  ) {
    setPartnerReviewConsent((current) => ({
      ...current,
      [field]: value
    }));
  }

  function downloadPartnerReviewBundle() {
    if (!workspace) {
      return;
    }

    if (
      !partnerReviewConsent.shareRedactedDataWithPartner
      || !partnerReviewConsent.acknowledgeSoftwareOnlyService
      || !partnerReviewConsent.acknowledgeSeparateProfessionalEngagement
    ) {
      setStorageMessage("Please check all acknowledgment boxes before downloading the review bundle.");
      return;
    }

    try {
      const requestDownload = buildProviderPartnerReviewRequestDownload(workspace, {
        consent: {
          ...partnerReviewConsent,
          capturedAt: new Date().toISOString()
        }
      });

      triggerBrowserDownload(
        requestDownload.fileName,
        requestDownload.contents,
        "application/json"
      );
      setPartnerReviewDownloadRun({
        requestId: requestDownload.bundle.requestId,
        requestedAt: requestDownload.bundle.requestedAt,
        fileName: requestDownload.fileName,
        replacementCount: requestDownload.bundle.replacementCount,
        redactions: requestDownload.bundle.redactions
      });
      setStorageMessage(`Downloaded ${requestDownload.fileName} to your local device.`);
    } catch (error) {
      setStorageMessage(
        resolveUiErrorMessage(
          error,
          "Could not generate the review bundle. Please try again."
        )
      );
    }
  }

  if (!workspace && !workspaceLookupComplete) {
    return (
      <div className="workspace-grid">
        <section className="hero">
          <p className="hero-kicker">TAX RETURN</p>
          <h1>Loading your return...</h1>
          <p className="hero-copy">{storageMessage ?? "One moment while we load your tax return."}</p>
        </section>
      </div>
    );
  }

  if (!workspace) {
    return (
      <div className="workspace-grid">
      <section className="hero">
        <p className="hero-kicker">TAX RETURN</p>
        <h1>
          {effectiveDeploymentMode === "hosted" && workspaceAvailability === "owner-required"
            ? "Sign in to access this return."
              : `Return ${workspaceId} is not saved locally.`}
          </h1>
          <p className="hero-copy">
            {effectiveDeploymentMode === "hosted" && workspaceAvailability === "owner-required"
              ? "Sign in to your account to load your saved returns."
              : "Start a new return from the home page, or create this one now and continue here."}
          </p>
          <div className="hero-actions">
            {effectiveDeploymentMode === "self-host" ? (
              <Link className="utility-button workspace-link" href={`/returns/${workspaceId}?create=1`}>
                Create this return
              </Link>
            ) : (
              <Link className="utility-button workspace-link" href="/returns/new">
                Sign In
              </Link>
            )}
            <Link className="utility-button workspace-link" href="/">
              Back to My Returns
            </Link>
          </div>
        </section>
      </div>
    );
  }

  const auditTrailEntries = [...workspace.auditTrail].reverse();
  const documentsById = new Map(workspace.documents.map((document) => [document.id, document]));
  const structuredFactsById = new Map(workspace.structuredFacts.map((fact) => [fact.id, fact]));
  const pendingInterviewQuestionCount = workspace.seededReturn.interviewQuestions.filter(
    (question) => question.status === "pending"
  ).length;
  const pendingInterviewQuestions = workspace.seededReturn.interviewQuestions.filter(
    (question) => question.status === "pending"
  );
  const answeredInterviewCount = workspace.seededReturn.interviewQuestions.length
    - pendingInterviewQuestionCount;
  const pendingInterviewSummary = summarizePendingInterviewQuestions(workspace.seededReturn.interviewQuestions);
  const guidedCompletionStatus = summarizeWorkspaceGuidedCompletion(workspace.guidedCompletion);
  const unsupportedRoutes = buildWorkspaceUnsupportedRoutes(workspace);
  const partnerReviewRoute = unsupportedRoutes.find((route) => route.id === "partner-review-later") ?? null;
  const unsupportedTaxYear = hasUnsupportedTaxYear(workspace.returnSummary);
  const unsupportedTaxYearNotice = formatUnsupportedTaxYearNotice(workspace.returnSummary);
  const filingPackDownload = workspace.documents.length > 0
    ? buildWorkspaceFilingPackDownload(workspace)
    : null;
  const canPresentCompletedBundle = canPresentCompletedReturnDownload({
    returnSummary: workspace.returnSummary,
    guidedFlowState: persistedGuidedFlowState,
    pendingInterviewQuestionCount,
    guidedReviewIssueCount: guidedReviewIssues.length,
    hasEnginePreview: workspace.enginePreview !== null
  });
  const hasBlockingActions = hasBlockingWorkspaceActions(unsupportedRoutes, {
    pendingInterviewQuestionCount,
    guidedReviewIssueCount: guidedReviewIssues.length
  });
  const canDownloadFilledReturnPdf = persistedGuidedFlowState?.taxYear === 2025
    && workspace.returnSummary.targetTaxYear === 2025;
  const filingPackPanelTitle = canPresentCompletedBundle ? "Return Bundle" : "Draft Return Bundle";
  const filingPackJumpLabel = canPresentCompletedBundle ? "Go to Return Bundle" : "Go to Draft Return Bundle";
  const filingPackIntroCopy = canPresentCompletedBundle
    ? "Download a review PDF with taxpayer IDs removed, or save the local JSON bundle with your structured data and audit notes. Filing exports are not yet qualified."
    : canDownloadFilledReturnPdf
      ? "You can download a review PDF after completing the required taxpayer facts. It is not a filing copy. Save the JSON bundle to retain your structured data and audit notes."
      : "Your return is not filing-ready yet. Download a local draft return bundle with the current forms data, checklist, and review notes.";
  const filingPackButtonLabel = canPresentCompletedBundle ? "Download Return Bundle (.json)" : "Download Draft Return Bundle (.json)";
  const missingItemsMemoIncluded = filingPackDownload?.filingPack.files.some(
    (file) => file.path === "05-missing-items-memo.txt"
  ) ?? false;
  const unsupportedNotesIncluded = filingPackDownload?.filingPack.files.some(
    (file) => file.path === "06-unsupported-situations.txt"
  ) ?? false;
  const modeState = buildDeploymentModeViewModel(effectiveDeploymentMode);
  const canGenerateProviderSummary = workspace.summary.totalDocuments > 0;
  const guidedSyntheticDocumentCount = countGuidedSyntheticDocuments(workspace.documents);
  const uploadedDocumentCount = countUploadedDocuments(workspace.documents);
  const uploadedSupportedDocumentCount = countUploadedSupportedDocuments(workspace.documents);
  const guidedSetupProgress = workspace.summary.totalDocuments === 0
    && workspace.seededReturn.status === "empty"
    ? summarizeGuidedSetupProgress(persistedGuidedFlowState)
    : null;
  const advancedStatusLabel = unsupportedTaxYear
    ? "Unsupported year"
    : canPresentCompletedBundle && !hasBlockingActions
      ? "Ready to review"
    : guidedCompletionStatus?.statusLabel
      ?? guidedSetupProgress?.statusLabel
      ?? formatStatusLabel(workspace.returnSummary.status);
  const advancedProgressLabel = guidedCompletionStatus?.progressLabel
    ?? guidedSetupProgress?.progressLabel
    ?? `${answeredInterviewCount}/${workspace.seededReturn.interviewQuestions.length} answered`;
  const heroProgressLabel = guidedCompletionStatus?.progressLabel
    ?? guidedSetupProgress?.progressLabel
    ?? pendingInterviewSummary?.progressLabel
    ?? "All current document questions answered";
  const uploadedDocumentHeadline = formatUploadedDocumentHeadline(
    uploadedDocumentCount,
    guidedSyntheticDocumentCount
  );
  const documentStatusMessage = formatDocumentStatusMessage(
    uploadedDocumentCount,
    guidedSyntheticDocumentCount,
    workspace.storageMode
  );
  const isReviewFocusedWorkspace = workspace.summary.totalDocuments > 0
    && pendingInterviewQuestionCount === 0
    && guidedReviewIssues.length === 0;

  const checklistPanel = (
    <RetroShell title="Checklist" eyebrow="PROGRESS">
      <ul className="stack-list">
        {workspace.checklist.map((item) => {
          const itemLabel = item.id === "interview"
            && guidedCompletionStatus
            && pendingInterviewQuestionCount === 0
            ? "Review guided sections"
            : item.label;

          return (
            <li key={item.id}>
              <strong>[{formatPillLabel(item.status)}]</strong> {itemLabel}
            </li>
          );
        })}
      </ul>
    </RetroShell>
  );

  const actionNeededPanel = unsupportedRoutes.length > 0 ? (
    <RetroShell
      title={hasBlockingActions ? "Action Needed" : "Optional Follow-Ups"}
      eyebrow={hasBlockingActions ? "ATTENTION" : "NOTES"}
      panelId="workspace-next-action-router"
    >
      <p className="panel-text">
        {hasBlockingActions
          ? "Some items need your attention before your return can be finalized. Please review them in order."
          : "Your return bundle is ready. These follow-ups are advisory and can help you review uploaded documents that were not deterministically mapped into the return."}
      </p>
      <div className="route-grid section-heading">
        {unsupportedRoutes.map((route) => {
          const isGuidedReviewRoute = route.id === "continue-interview"
            && guidedCompletionStatus
            && pendingInterviewQuestionCount === 0;
          const routeTitle = isGuidedReviewRoute
            ? "Review guided sections"
            : route.id === "review-filing-pack" && canPresentCompletedBundle
              ? "Download your return bundle"
              : route.title;
          const routeDescription = isGuidedReviewRoute
            ? "Return to the guided interview and revisit the sections you skipped before relying on this return."
            : route.id === "review-filing-pack" && canPresentCompletedBundle
              ? "Download your return bundle. Advisory notes about uploaded documents are included in the export."
            : route.description;

          return (
            <article className="route-card" key={route.id}>
              <div className="document-card-top">
                <div>
                  <p className="summary-label">action</p>
                  <strong>{routeTitle}</strong>
                </div>
                <span className={`status-pill status-${route.urgency}`}>{route.urgency}</span>
              </div>
              <p className="route-summary">{routeDescription}</p>
              {route.reasons.length > 0 ? (
                <div className="trace-block section-heading">
                  <p className="trace-caption">Why this needs attention</p>
                  <ul className="stack-list route-reasons">
                    {route.reasons.map((reason) => (
                      <li key={`${route.id}:${reason}`}>{reason}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {route.relatedFactIds.length > 0 ? (
                <div className="trace-block section-heading">
                  <p className="trace-caption">Related items</p>
                  <ul className="trace-list" aria-label={`${routeTitle} related items`}>
                    {route.relatedFactIds.map((factId) => (
                      <li className="trace-chip" key={`${route.id}:${factId}`}>
                        {seededFactLabels[factId]}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {route.sourceDocumentIds.length > 0 ? (
                <div className="trace-block section-heading">
                  <p className="trace-caption">Related documents</p>
                  <ul className="trace-list" aria-label={`${routeTitle} related documents`}>
                    {formatDocumentTrace(route.sourceDocumentIds, documentsById).map((document) => (
                      <li className="trace-chip" key={`${route.id}:${document.id}`}>
                        {document.displayLabel}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {route.id === "continue-interview" ? (
                <div className="inline-actions">
                  <button
                    className="utility-button utility-button-small"
                    type="button"
                    onClick={() => {
                      jumpToPanel("workspace-interview-loop");
                    }}
                  >
                    {isGuidedReviewRoute ? "Review guided sections" : "Go to Questions"}
                  </button>
                </div>
              ) : null}
              {route.id === "review-filing-pack" ? (
                <div className="inline-actions">
                  <button
                    className="utility-button utility-button-small"
                    type="button"
                    onClick={() => {
                      jumpToPanel("workspace-filing-pack");
                    }}
                  >
                    {filingPackJumpLabel}
                  </button>
                </div>
              ) : null}
              {route.id === "partner-review-later" ? (
                <div className="inline-actions">
                  <button
                    className="utility-button utility-button-small"
                    type="button"
                    onClick={() => {
                      jumpToPanel("workspace-partner-review");
                    }}
                  >
                    Go to Outside Review Bundle
                  </button>
                </div>
              ) : null}
            </article>
          );
        })}
      </div>
    </RetroShell>
  ) : null;

  const filingPackPanel = (
    <RetroShell title={filingPackPanelTitle} eyebrow="DOWNLOAD" panelId="workspace-filing-pack">
      {filingPackDownload ? (
        <>
          <p className="panel-text">
            {filingPackIntroCopy}
          </p>
          <div className="summary-grid section-heading">
            <article className="summary-stat">
              <p className="summary-label">return status</p>
              <strong>{canPresentCompletedBundle ? "Ready to review" : formatStatusLabel(filingPackDownload.filingPack.manifest.returnStatus)}</strong>
            </article>
            <article className="summary-stat">
              <p className="summary-label">target tax year</p>
              <strong>{filingPackDownload.filingPack.manifest.targetTaxYear ?? "draft"}</strong>
            </article>
            <article className="summary-stat">
              <p className="summary-label">files included</p>
              <strong>{filingPackDownload.filingPack.files.length}</strong>
            </article>
            <article className="summary-stat">
              <p className="summary-label">stored on device</p>
              <strong>{filingPackDownload.filingPack.manifest.localOnly ? "yes" : "no"}</strong>
            </article>
          </div>
          <div className="inline-actions">
            {canDownloadFilledReturnPdf ? (
              <button
                className="utility-button"
                type="button"
                onClick={() => {
                  void downloadFilledReturnPdf();
                }}
                disabled={filledReturnPending}
              >
                {filledReturnPending
                  ? "Generating Filled Return PDF..."
                  : canPresentCompletedBundle
                    ? "Download Review PDF"
                    : "Download Draft Filled Return PDF"}
              </button>
            ) : null}
            <button className="utility-button" type="button" onClick={downloadFilingPack}>
              {filingPackButtonLabel}
            </button>
          </div>
          {canDownloadFilledReturnPdf ? (
          <p className="answer-note">
            {canPresentCompletedBundle
                ? "Download an experimental reference PDF for the forms and reference summaries we currently generate. It is not filing-ready, may omit supporting schedules or e-file checks, and Social Security numbers are redacted by design."
                : "The filled PDF is an experimental draft based on your guided answers. Unsupported uploads, still-reviewed items, and some state output may appear only as reference summaries rather than official filled forms."}
          </p>
          ) : (
            <p className="answer-note">
              This download is a local JSON return bundle with supporting notes while the return is still in draft.
            </p>
          )}
          {!canPresentCompletedBundle ? (
            <p className="answer-note">
              Review the unanswered items and checklist notes in this draft bundle before relying on it.
            </p>
          ) : null}
          <p className="document-meta section-heading">
            Included in your download:
          </p>
          <ul className="stack-list">
            {filingPackDownload.filingPack.files.map((file) => (
              <li key={file.path}>{formatFilingPackFileName(file.path)}</li>
            ))}
          </ul>
          {missingItemsMemoIncluded ? (
            <p className="answer-note">
              This download includes a note about items to review before you file.
            </p>
          ) : null}
          {unsupportedNotesIncluded ? (
            <p className="answer-note">
              Some parts of your return may need outside review. See the included notes.
            </p>
          ) : null}
        </>
      ) : (
        <p className="panel-text">
          Upload at least one document to generate your return bundle.
        </p>
      )}
    </RetroShell>
  );

  const partnerReviewPanel = partnerReviewRoute ? (
    <RetroShell
      title="Outside Review Bundle"
      eyebrow="OPTIONAL"
      panelId="workspace-partner-review"
    >
      <p className="panel-text">
        Download a summary bundle to share with a tax professional or other
        advisor you engage separately. Viva La Tax does not contact, assign,
        or supervise any reviewer for you.
      </p>
      <div className="summary-grid section-heading">
        <article className="summary-stat">
          <p className="summary-label">priority</p>
          <strong>{partnerReviewRoute.urgency}</strong>
        </article>
        <article className="summary-stat">
          <p className="summary-label">related documents</p>
          <strong>{partnerReviewRoute.sourceDocumentIds.length}</strong>
        </article>
        <article className="summary-stat">
          <p className="summary-label">reasons</p>
          <strong>{partnerReviewRoute.reasons.length}</strong>
        </article>
        <article className="summary-stat">
          <p className="summary-label">status</p>
          <strong>{partnerReviewDownloadRun ? "downloaded" : "awaiting consent"}</strong>
        </article>
      </div>
      <ul className="stack-list section-heading">
        <li>The review bundle is downloaded to your device only.</li>
        <li>Finding and contacting a reviewer is your responsibility.</li>
        <li>Sensitive information is redacted before anything leaves your device.</li>
      </ul>
      <div className="trace-block section-heading">
        <p className="trace-caption">Why outside review is recommended</p>
        <ul className="stack-list route-reasons">
          {partnerReviewRoute.reasons.map((reason) => (
            <li key={reason}>{reason}</li>
          ))}
        </ul>
      </div>
      <div className="trace-block section-heading">
        <p className="trace-caption">Consent acknowledgments</p>
        <ul className="stack-list consent-list">
          <li className="document-card">
            <label className="consent-toggle">
              <input
                type="checkbox"
                checked={partnerReviewConsent.shareRedactedDataWithPartner}
                onChange={(event) => {
                  setPartnerReviewConsentField(
                    "shareRedactedDataWithPartner",
                    event.target.checked
                  );
                }}
              />
              <span>I consent to share a redacted summary of my return with a tax professional for review.</span>
            </label>
          </li>
          <li className="document-card">
            <label className="consent-toggle">
              <input
                type="checkbox"
                checked={partnerReviewConsent.acknowledgeSoftwareOnlyService}
                onChange={(event) => {
                  setPartnerReviewConsentField(
                    "acknowledgeSoftwareOnlyService",
                    event.target.checked
                  );
                }}
              />
              <span>I understand this is a software tool and not a professional tax preparation service.</span>
            </label>
          </li>
          <li className="document-card">
            <label className="consent-toggle">
              <input
                type="checkbox"
                checked={partnerReviewConsent.acknowledgeSeparateProfessionalEngagement}
                onChange={(event) => {
                  setPartnerReviewConsentField(
                    "acknowledgeSeparateProfessionalEngagement",
                    event.target.checked
                  );
                }}
              />
              <span>I understand any professional review happens separately from this product after download.</span>
            </label>
          </li>
        </ul>
      </div>
      <div className="inline-actions">
        <button
          className="utility-button"
          type="button"
          onClick={downloadPartnerReviewBundle}
          disabled={
            !partnerReviewConsent.shareRedactedDataWithPartner
            || !partnerReviewConsent.acknowledgeSoftwareOnlyService
            || !partnerReviewConsent.acknowledgeSeparateProfessionalEngagement
          }
        >
          Download Review Bundle
        </button>
      </div>
      <p className="document-meta section-heading">
        Consent timestamp is captured when the download is generated.
      </p>
      {partnerReviewDownloadRun ? (
        <>
          <p className="answer-note">
            Downloaded {partnerReviewDownloadRun.fileName}. {partnerReviewDownloadRun.replacementCount} identifying details were automatically protected.
          </p>
          <p className="document-meta section-heading">
            request id: {partnerReviewDownloadRun.requestId}
          </p>
          <p className="document-meta">
            requested at: {partnerReviewDownloadRun.requestedAt}
          </p>
          <p className="panel-text section-heading">Protected detail types</p>
          {summarizeProtectedDetails(partnerReviewDownloadRun.redactions).length > 0 ? (
            <ul className="trace-list" aria-label="Protected identifying details">
              {summarizeProtectedDetails(partnerReviewDownloadRun.redactions).map((label) => (
                <li className="trace-chip" key={label}>
                  {label}
                </li>
              ))}
            </ul>
          ) : (
            <p className="document-meta">No identifying details were detected in your return bundle.</p>
          )}
        </>
      ) : null}
    </RetroShell>
  ) : null;

  if (guidedMode) {
    return (
      <div className="workspace-grid">
        <GuidedInterviewShell
          workspace={workspace}
          onExitGuided={() => {
            setGuidedMode(false);
            setGuidedResumeSectionId(null);
          }}
          onUploadDocuments={handleGuidedUpload}
          resumeSectionId={guidedResumeSectionId}
          onSyncToWorkspace={(syntheticDocuments, factAnswers, guidedFlowState) => {
            const synced = syncGuidedFlowToWorkspace(workspace, syntheticDocuments, factAnswers, guidedFlowState);
            setWorkspace(synced);
            void persistHostedWorkspace(synced);
            setGuidedMode(false);
            setGuidedResumeSectionId(null);
          }}
        />
      </div>
    );
  }

  return (
    <div className="workspace-grid">
      <div className="guided-mode-toggle" style={{ justifyContent: "flex-start" }}>
        <button
          className="utility-button utility-button-small"
          type="button"
          onClick={() => setGuidedMode(true)}
        >
          Start guided interview
        </button>
      </div>

      <ReturnHelpDock
        workspace={workspace}
        mode="workspace"
        onUploadDocuments={handleGuidedUpload}
        deploymentMode={effectiveDeploymentMode}
        onOpenGuided={() => setGuidedMode(true)}
      />

      <section className="hero">
        <p className="hero-kicker">RETURN DETAILS</p>
        <h1>Tax Return {workspace.id}</h1>
        <p className="hero-copy">
          Upload forms, answer remaining questions, and review everything in one place.
        </p>
        <p className="hero-copy">
          Prefer step-by-step help? The guided interview walks your uploaded documents with you
          and keeps AI-suggested values highlighted until you confirm them.
        </p>
        <div className="hero-bar">
          <span>{uploadedDocumentHeadline}</span>
          <span>{heroProgressLabel}</span>
          <span>status: {advancedStatusLabel}</span>
        </div>
        <div className="hero-actions">
          <button
            className="launch-button"
            type="button"
            onClick={() => {
              setGuidedResumeSectionId(guidedReviewIssues[0]?.sectionId ?? null);
              setGuidedMode(true);
            }}
          >
            Get step-by-step help
          </button>
          <Link className="utility-button workspace-link" href="/">
            Back to My Returns
          </Link>
        </div>
        {unsupportedTaxYearNotice ? (
          <p className="document-meta">{unsupportedTaxYearNotice}</p>
        ) : guidedCompletionStatus ? (
          <p className="document-meta">{guidedCompletionStatus.helperText}</p>
        ) : guidedSetupProgress ? (
          <p className="document-meta">{guidedSetupProgress.helperText}</p>
        ) : null}
      </section>

      {guidedReviewIssues.length > 0 ? (
        <RetroShell title="Needs Review" eyebrow="NEXT STEP">
          <p className="panel-text">
            {guidedReviewSummary
              ?? "Some guided sections still need attention. Open the flagged section below and resolve the highlighted answers before continuing."}
          </p>
          <ul className="stack-list summary-list">
            {guidedReviewIssues.map((issue) => (
              <li key={issue.sectionId}>
                <strong>{issue.sectionLabel}:</strong> {issue.message}
              </li>
            ))}
          </ul>
          <div className="inline-actions">
            {guidedReviewIssues.map((issue) => (
              <button
                key={issue.sectionId}
                className="utility-button utility-button-small"
                type="button"
                onClick={() => {
                  setGuidedResumeSectionId(issue.sectionId);
                  setGuidedMode(true);
                }}
              >
                {issue.actionLabel}
              </button>
            ))}
          </div>
        </RetroShell>
      ) : null}

      {pendingInterviewQuestionCount > 0 ? (
        <RetroShell title="Next Steps" eyebrow="ANSWER THESE">
          <p className="panel-text">
            {pendingInterviewSummary?.helperText
              ?? "Answer the remaining return questions before generating the final return."}
          </p>
          <ul className="stack-list summary-list">
            {pendingInterviewQuestions.map((question) => (
              <li key={question.id}>
                <strong>{seededFactLabels[question.factId]}:</strong> {question.prompt}
              </li>
            ))}
          </ul>
          <div className="inline-actions">
            <button
              className="utility-button utility-button-small"
              type="button"
              onClick={() => {
                jumpToPanel("workspace-interview-loop");
              }}
            >
              Go to Questions
            </button>
          </div>
        </RetroShell>
      ) : null}

      {isReviewFocusedWorkspace ? (
        <div className="two-up">
          <div className="panel-stack">
            {filingPackPanel}
            {partnerReviewPanel}
          </div>
          <div className="panel-stack">
            {actionNeededPanel}
            {checklistPanel}
          </div>
        </div>
      ) : null}

      <RefundTicker
        enginePreview={workspace.enginePreview}
        fallbackPreview={guidedFallbackPreview}
        workspaceStatus={workspace.returnSummary.status}
      />

      {(() => {
        const summaryPanels = (
        <div className="panel-stack">
          <RetroShell title="Return Summary" eyebrow="OVERVIEW" panelId="workspace-return-summary">
            <div className="summary-grid">
              <article className="summary-stat">
                <p className="summary-label">documents</p>
                <strong>{formatStatusLabel(workspace.seededReturn.status)}</strong>
              </article>
              <article className="summary-stat">
                <p className="summary-label">return status</p>
                <strong>{advancedStatusLabel}</strong>
              </article>
              <article className="summary-stat">
                <p className="summary-label">questions</p>
                <strong>{advancedProgressLabel}</strong>
              </article>
              <article className="summary-stat">
                <p className="summary-label">target tax year</p>
                <strong>{formatWorkspaceTaxYearSummary(workspace.returnSummary)}</strong>
              </article>
            </div>
            <ul className="stack-list summary-list">
              <li>
                {formatStoredDocumentSummary(uploadedDocumentCount, workspace.storageMode)}
              </li>
              {guidedSyntheticDocumentCount > 0 ? (
                <li>Guided answers synced from the interview</li>
              ) : null}
              {workspace.summary.officialFixtureMatches > 0 ? (
                <li>{formatFixtureDocumentCount(workspace.summary.officialFixtureMatches)} loaded</li>
              ) : null}
              <li>{formatWorkspaceCalculationStatus(uploadedSupportedDocumentCount, workspace.returnSummary)}</li>
              <li>{workspace.summary.pendingReviewDocuments} documents need review</li>
              <li>
                tax year: {workspace.seededReturn.taxYearHints.length > 0
                  ? workspace.seededReturn.taxYearHints.join(", ")
                  : "not yet determined"}
              </li>
            </ul>
            {unsupportedTaxYearNotice ? (
              <p className="panel-text">{unsupportedTaxYearNotice}</p>
            ) : guidedCompletionStatus ? (
              <p className="panel-text">{guidedCompletionStatus.helperText}</p>
            ) : guidedSetupProgress && workspace.returnSummary.items.length > 0 ? (
              <p className="panel-text">{guidedSetupProgress.helperText}</p>
            ) : null}
            {workspace.returnSummary.items.length > 0 ? (
              <>
                <p className="panel-text section-heading">Return items</p>
                <ul className="stack-list interview-list">
                  {workspace.returnSummary.items.map((item) => (
                    <li className="interview-card" key={item.id}>
                      <div className="document-card-top">
                        <strong>{item.label}</strong>
                        <span className={`status-pill status-${item.status}`}>
                          {formatPillLabel(item.status)}
                        </span>
                      </div>
                      <p className="document-meta">
                        facts confirmed: {item.answeredFactCount}/{item.factCount}
                      </p>
                      <div className="trace-block">
                        <p className="trace-caption">Applicable forms</p>
                        <ul className="trace-list" aria-label={`${item.label} applicable forms`}>
                          {item.engineTargets.map((target) => (
                            <li className="trace-chip" key={target}>
                              {target}
                            </li>
                          ))}
                        </ul>
                      </div>
                      <div className="trace-block">
                        <p className="trace-caption">Related documents</p>
                        <ul className="trace-list" aria-label={`${item.label} related documents`}>
                          {formatDocumentTrace(item.sourceDocumentIds, documentsById).map((document) => (
                            <li className="trace-chip" key={document.id}>
                              {document.displayLabel}
                            </li>
                          ))}
                        </ul>
                      </div>
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <p className="panel-text section-heading">
                {guidedSetupProgress?.helperText ?? "Upload a tax document to begin building your return."}
              </p>
            )}
            {workspace.returnSummary.blockers.length > 0 ? (
              <>
                <p className="panel-text section-heading">Issues to resolve</p>
                <ul className="stack-list">
                  {workspace.returnSummary.blockers.map((blocker) => (
                    <li key={blocker.id}>{blocker.message}</li>
                  ))}
                </ul>
              </>
            ) : null}
            {workspace.documents.length > 0 && !workspace.enginePreview && !guidedFallbackPreview ? (
              <p className="panel-text">
                A calculation requires complete taxpayer facts for the selected year. Open the guided interview to confirm your filing status, birth dates, residency and eligibility details. Answering document questions alone does not establish those facts.
              </p>
            ) : null}
          </RetroShell>

          <StateReturnPanel
            stateCodes={workspace.enginePreview?.filingState ? [workspace.enginePreview.filingState] : []}
          />

          <RetroShell title="Questions" eyebrow="REVIEW" panelId="workspace-interview-loop">
            {workspace.seededReturn.interviewQuestions.length > 0 ? (
              <>
                <p className="panel-text">
                  Questions to answer
                  {workspace.seededReturn.nextQuestionId
                    ? ` · next: ${seededFactLabels[workspace.seededReturn.nextQuestionId]}`
                    : guidedCompletionStatus
                      ? " · all current document questions answered"
                      : " · all answered"}
                </p>
                <p className="panel-text">
                  Answer these in plain English. Use a short confirmation sentence. Do not enter 0 unless the prompt is specifically asking for a dollar amount.
                </p>
                {guidedCompletionStatus && pendingInterviewQuestionCount === 0 ? (
                  <p className="panel-text">{guidedCompletionStatus.helperText}</p>
                ) : null}
                <ul className="stack-list interview-list">
                  {workspace.seededReturn.interviewQuestions.map((question) => (
                    <li className="interview-card" key={question.id}>
                      {(() => {
                        const questionUiHint = getInterviewQuestionUiHint(question.factId);

                        return (
                          <>
                      <div className="document-card-top">
                        <strong>{seededFactLabels[question.factId]}</strong>
                        <span className={`status-pill status-${question.status}`}>
                          {formatPillLabel(question.status)}
                        </span>
                      </div>
                      <p className="document-meta">{question.prompt}</p>
                      <p className="document-meta">
                        related documents: {question.sourceDocumentIds.length}
                      </p>
                      <div className="trace-block">
                        <p className="trace-caption">Related documents</p>
                        <ul
                          className="trace-list"
                          aria-label={`${seededFactLabels[question.factId]} related documents`}
                        >
                          {formatDocumentTrace(question.sourceDocumentIds, documentsById).map((document) => (
                            <li className="trace-chip" key={document.id}>
                              {document.displayLabel}
                            </li>
                          ))}
                        </ul>
                      </div>
                      {question.answeredAt ? (
                        <p className="document-meta">
                          answered locally at {new Date(question.answeredAt).toLocaleString("en-US")}
                        </p>
                      ) : null}
                      {question.answerText ? (
                        <p className="answer-note">{question.answerText}</p>
                      ) : null}
                      <div className="inline-actions">
                        {question.status === "pending" ? (
                          <>
                            <label className="answer-note-label" htmlFor={`answer-${question.id}`}>
                              Your answer
                            </label>
                            <p className="document-meta">{questionUiHint.helperText}</p>
                            <textarea
                              id={`answer-${question.id}`}
                              className="answer-note-input"
                              value={answerDrafts[question.id] ?? ""}
                              placeholder={questionUiHint.placeholder}
                              onChange={(event) => {
                                const nextValue = event.target.value;
                                setAnswerDrafts((current) => ({
                                  ...current,
                                  [question.id]: nextValue
                                }));
                              }}
                            />
                            <div className="inline-actions">
                              {questionUiHint.quickAnswers.map((quickAnswer) => (
                                <button
                                  key={`${question.id}:${quickAnswer.label}`}
                                  className="utility-button utility-button-small"
                                  type="button"
                                  onClick={() => {
                                    setAnswerDrafts((current) => ({
                                      ...current,
                                      [question.id]: quickAnswer.value
                                    }));
                                  }}
                                >
                                  {quickAnswer.label}
                                </button>
                              ))}
                            </div>
                            <button
                              className="utility-button utility-button-small"
                              type="button"
                              onClick={() => {
                                markInterviewQuestionAnswered(
                                  question.id,
                                  question.prompt,
                                  answerDrafts[question.id] ?? ""
                                );
                              }}
                            >
                              Save answer
                            </button>
                          </>
                        ) : (
                          <button
                            className="utility-button utility-button-small"
                            type="button"
                            onClick={() => {
                              reopenInterviewPrompt(question.id, question.prompt);
                            }}
                          >
                            Reopen question
                          </button>
                        )}
                      </div>
                          </>
                        );
                      })()}
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <p className="panel-text">
                {guidedSetupProgress?.helperText ?? "Upload tax documents to see relevant questions."}
              </p>
            )}
            {workspace.seededReturn.reviewNotes.length > 0 ? (
              <>
                <p className="panel-text section-heading">Review notes</p>
                <ul className="stack-list">
                  {workspace.seededReturn.reviewNotes.map((note) => (
                    <li key={note}>{note}</li>
                  ))}
                </ul>
              </>
            ) : null}
          </RetroShell>
        </div>
        );

        if (isReviewFocusedWorkspace) {
          return summaryPanels;
        }

        return (
          <div className="two-up">
            <RetroShell title="Upload Documents" eyebrow="DOCUMENTS">
              <label className="upload-tray" htmlFor="upload-documents">
                <span className="upload-title">Upload your tax documents (W-2s, 1099s, etc.)</span>
                <span className="upload-copy">
                  Supported formats: W-2, 1099-INT, 1099-DIV, 1099-B, 1099-R, 1099-SA,
                  1099-NEC, and IRS training guides. Upload as PDF.
                </span>
                <input
                  id="upload-documents"
                  className="upload-input"
                  type="file"
                  accept="application/pdf"
                  multiple
                  onChange={syncUpload}
                />
              </label>
              <div className="inline-actions">
                <button className="utility-button" type="button" onClick={resetWorkspace}>
                  Reset Return
                </button>
                <span
                  className="status-inline"
                  role="status"
                  aria-live="polite"
                  aria-label="Return status"
                >
                  {storageMessage ?? documentStatusMessage}
                </span>
              </div>
            </RetroShell>

            {summaryPanels}
          </div>
        );
      })()}

      <div className="two-up">
        <RetroShell
          title="Show Your Work"
          eyebrow="DETAILS"
          collapsible
          defaultCollapsed={isReviewFocusedWorkspace}
        >
          {workspace.seededReturn.facts.length > 0 ? (
            <>
              <p className="panel-text">Confirmed details</p>
              <ul className="stack-list interview-list">
                {workspace.seededReturn.facts.map((fact) => (
                  <li className="interview-card" key={fact.id}>
                    <div className="document-card-top">
                      <strong>{fact.label}</strong>
                      <span className={`status-pill status-${fact.status}`}>
                        {formatPillLabel(fact.status)}
                      </span>
                    </div>
                    <p className="document-meta">
                      related documents: {fact.sourceDocumentIds.length}
                    </p>
                    <div className="trace-block">
                      <p className="trace-caption">Related documents</p>
                      <ul className="trace-list" aria-label={`${fact.label} related documents`}>
                        {formatDocumentTrace(fact.sourceDocumentIds, documentsById).map((document) => (
                          <li className="trace-chip" key={document.id}>
                            {document.displayLabel}
                          </li>
                        ))}
                      </ul>
                    </div>
                    {fact.answerText ? (
                      <p className="answer-note">{fact.answerText}</p>
                    ) : (
                      <p className="document-meta">Waiting for your answer.</p>
                    )}
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="panel-text">Details will appear here after you upload your first tax document.</p>
          )}
          {workspace.structuredFacts.length > 0 ? (
            <>
              <p className="panel-text section-heading">Extracted tax data</p>
              <ul className="stack-list interview-list">
                {workspace.structuredFacts.map((fact) => (
                  <li className="interview-card" key={fact.id}>
                    <div className="document-card-top">
                      <strong>{fact.label}</strong>
                      <span className="document-meta">{formatDocumentKind(fact.kind)}</span>
                    </div>
                    <p className="document-meta">
                      {formatSourceType(fact.sourceType)} · {formatStructuredFactConfidence(fact, workspace.seededReturn.facts)}
                    </p>
                    {fact.updatedAt ? (
                      <p className="document-meta">
                        updated at {new Date(fact.updatedAt).toLocaleString("en-US")}
                      </p>
                    ) : null}
                    <p className="answer-note">{fact.value}</p>
                    <div className="trace-block">
                      <p className="trace-caption">Related documents</p>
                      <ul className="trace-list" aria-label={`${fact.label} related documents`}>
                        {formatDocumentTrace(fact.sourceDocumentIds, documentsById).map((document) => (
                          <li className="trace-chip" key={document.id}>
                            {document.displayLabel}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
          {workspace.enginePreview ? (
            <>
              <p className="panel-text section-heading">{workspace.enginePreview.title}</p>
              <div className="summary-grid">
                <article className="summary-stat">
                  <p className="summary-label">filing method</p>
                  <strong>{workspace.enginePreview.mode}</strong>
                </article>
                <article className="summary-stat">
                  <p className="summary-label">filing status</p>
                  <strong>{workspace.enginePreview.filingStatus}</strong>
                </article>
                <article className="summary-stat">
                  <p className="summary-label">tax year</p>
                  <strong>{workspace.enginePreview.taxYear}</strong>
                </article>
                <article className="summary-stat">
                  <p className="summary-label">based on</p>
                  <strong>{workspace.enginePreview.sourceFixtureIds.length} document{workspace.enginePreview.sourceFixtureIds.length === 1 ? "" : "s"}</strong>
                </article>
              </div>
              <ul className="stack-list interview-list">
                {Object.entries(workspace.enginePreview.metrics).map(([metricId, value]) => (
                  <li className="interview-card" key={metricId}>
                    <div className="document-card-top">
                      <strong>{metricId.replace(/([A-Z])/g, " $1").toLowerCase()}</strong>
                      <span className="status-pill status-ready">{formatCurrencyString(value)}</span>
                    </div>
                  </li>
                ))}
              </ul>
              <p className="panel-text section-heading">Assumptions used</p>
              <ul className="stack-list">
                {workspace.enginePreview.assumptions.map((assumption) => (
                  <li key={assumption}>{assumption}</li>
                ))}
              </ul>
              <p className="panel-text section-heading">Key calculations</p>
              <ul className="stack-list interview-list">
                {workspace.enginePreview.highlightedLines.map((line) => (
                  <li className="interview-card" key={line.id}>
                    <div className="document-card-top">
                      <strong>{line.form} Line {line.line}</strong>
                      <span className="status-pill status-ready">{formatCurrencyString(line.value)}</span>
                    </div>
                    <p className="document-meta">{line.label}</p>
                    <p className="answer-note">{line.formula}</p>
                    {line.sourceFactIds.length > 0 ? (
                      <div className="trace-block">
                        <p className="trace-caption">Based on</p>
                        <ul className="trace-list" aria-label={`${line.form} line ${line.line} source data`}>
                          {formatStructuredFactTrace(line.sourceFactIds, structuredFactsById).map((fact) => (
                            <li className="trace-chip" key={fact.id}>
                              {fact.displayLabel}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                  </li>
                ))}
              </ul>
              <div className="trace-block section-heading">
                <p className="trace-caption">Calculated from</p>
                <ul className="trace-list" aria-label="Calculation source documents">
                  {formatDocumentTrace(workspace.enginePreview.sourceDocumentIds, documentsById).map((document) => (
                    <li className="trace-chip" key={document.id}>
                      {document.displayLabel}
                    </li>
                  ))}
                </ul>
              </div>
            </>
          ) : null}
        </RetroShell>

        <div className="panel-stack">
          <RetroShell
            title="Your Documents"
            eyebrow="UPLOADED"
            collapsible
            defaultCollapsed={isReviewFocusedWorkspace}
          >
            {workspace.documents.length === 0 ? (
              <p className="panel-text">
                Upload your tax documents (W-2s, 1099s, etc.) to populate your return.
              </p>
            ) : (
              <ul className="document-list">
                {workspace.documents.map((document) => (
                  <li className="document-card" key={document.id}>
                    <div className="document-card-top">
                      <strong>{document.label}</strong>
                      <div className="document-card-actions">
                        <span className={`status-pill status-${document.coverage}`}>
                          {formatDocumentCoverageLabel(document.coverage, workspace.returnSummary)}
                        </span>
                        <button
                          className="utility-button utility-button-small"
                          type="button"
                          onClick={() => {
                            removeWorkspaceDocument(document.id, document.label);
                          }}
                        >
                          Remove {document.label}
                        </button>
                      </div>
                    </div>
                    <p className="document-meta">{document.name}</p>
                    <p className="document-meta">{document.notes}</p>
                    <DocumentTaxYearField
                      key={`${document.id}:${document.taxYear ?? "unknown"}`}
                      taxYear={document.taxYear}
                      fixture={Boolean(document.matchedFixtureId)}
                      onConfirm={(year) => confirmDocumentYear(document.id, year)}
                    />
                    {formatDocumentCoverageNote(document.coverage, workspace.returnSummary) ? (
                      <p className="document-meta">
                        {formatDocumentCoverageNote(document.coverage, workspace.returnSummary)}
                      </p>
                    ) : null}
                    <p className="document-meta">
                      {formatMatchedDocumentStatus(document)}
                    </p>
                    <p className="document-meta">
                      {document.seededFactIds.length > 0
                        ? `Data found: ${document.seededFactIds.map((factId) => seededFactLabels[factId]).join(", ")}`
                        : "No data found yet"}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </RetroShell>

          <RetroShell
            title="Activity Log"
            eyebrow="HISTORY"
            collapsible
            defaultCollapsed={isReviewFocusedWorkspace}
          >
            {auditTrailEntries.length === 0 ? (
              <p className="panel-text">No activity recorded yet.</p>
            ) : (
              <ul className="stack-list interview-list">
                {auditTrailEntries.map((event) => (
                  <li className="interview-card" key={event.id}>
                    <div className="document-card-top">
                      <strong>{event.message}</strong>
                      <span className={`status-pill status-${event.kind}`}>
                        {formatAuditEventKindLabel(event.kind)}
                      </span>
                    </div>
                    <p className="document-meta">
                      {new Date(event.occurredAt).toLocaleString("en-US")}
                    </p>
                    {event.questionId ? (
                      <p className="document-meta">
                        topic: {seededFactLabels[event.questionId]}
                      </p>
                    ) : null}
                    {event.documentIds.length > 0 ? (
                      <div className="trace-block">
                        <p className="trace-caption">
                          Related docs: {event.documentIds.length}
                        </p>
                        <ul className="trace-list" aria-label={`${event.message} related documents`}>
                          {formatDocumentTrace(event.documentIds, documentsById).map((document) => (
                            <li className="trace-chip" key={document.id}>
                              {document.displayLabel}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                    {event.answerText ? (
                      <p className="answer-note">{event.answerText}</p>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </RetroShell>

          {!isReviewFocusedWorkspace ? checklistPanel : null}

          <DeploymentModePanel
            modeState={modeState}
            title={effectiveDeploymentMode === "hosted" ? "Account & Plan" : "Local Mode"}
            eyebrow="SETTINGS"
          />

          {!isReviewFocusedWorkspace ? actionNeededPanel : null}

          {!isReviewFocusedWorkspace ? filingPackPanel : null}

          {!isReviewFocusedWorkspace ? partnerReviewPanel : null}

          <RetroShell
            title="AI Summary"
            eyebrow="PRIVACY-SAFE"
            collapsible
            defaultCollapsed={isReviewFocusedWorkspace}
          >
            <p className="panel-text">
              Get an AI-generated summary of your return. Your personal information is
              automatically removed before anything leaves your device.
            </p>
            {!canGenerateProviderSummary ? (
              <p className="document-meta section-heading">
                Upload at least one tax document before generating an AI summary.
              </p>
            ) : null}
            <div className="inline-actions">
              <button
                className="utility-button"
                type="button"
                onClick={() => {
                  void runProviderSummary();
                }}
                disabled={providerSummaryPending || !canGenerateProviderSummary}
              >
                {providerSummaryPending ? "Generating summary..." : "Get AI Summary"}
              </button>
            </div>
            {providerSummaryError ? (
              <div className="inline-alert inline-alert-warning" role="alert">
                <p className="inline-alert-title">AI summary unavailable</p>
                <p className="inline-alert-body">{providerSummaryError}</p>
              </div>
            ) : null}
            {providerSummaryRun ? (
              <>
                <div className="summary-grid section-heading">
                  <article className="summary-stat">
                    <p className="summary-label">powered by</p>
                    <strong>{providerSummaryRun.response.provider}</strong>
                  </article>
                  <article className="summary-stat">
                    <p className="summary-label">details protected</p>
                    <strong>{providerSummaryRun.response.redactionCount}</strong>
                  </article>
                  <article className="summary-stat">
                    <p className="summary-label">questions left</p>
                    <strong>{providerSummaryRun.response.pendingQuestionCount}</strong>
                  </article>
                  <article className="summary-stat">
                    <p className="summary-label">return bundle ready</p>
                    <strong>{canPresentCompletedBundle ? "yes" : "no"}</strong>
                  </article>
                </div>
                <p className="answer-note">{providerSummaryRun.response.summary}</p>
                <p className="document-meta">request id: {providerSummaryRun.requestId}</p>
                <p className="panel-text section-heading">Protected detail types</p>
                {summarizeProtectedDetails(providerSummaryRun.redactions).length > 0 ? (
                  <ul className="trace-list" aria-label="Protected identifying detail types">
                    {summarizeProtectedDetails(providerSummaryRun.redactions).map((label) => (
                      <li className="trace-chip" key={label}>
                        {label}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="document-meta">No identifying details were detected in the shared summary payload.</p>
                )}
              </>
            ) : null}
          </RetroShell>
        </div>
      </div>

    </div>
  );
}
