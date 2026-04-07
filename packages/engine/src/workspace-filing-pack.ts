import type {
  ReturnWorkspaceRecord,
  WorkspaceChecklistItem,
  WorkspaceFilingPack,
  WorkspaceFilingPackFile
} from "@tax-engine/contracts";
import { seededFactDefinitions } from "@tax-engine/contracts";
import { buildWorkspaceUnsupportedRoutes } from "./workspace-unsupported-routes";

function buildDownloadFileName(workspace: ReturnWorkspaceRecord) {
  const workspaceToken = workspace.id
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    || "workspace";
  const yearToken = workspace.returnSummary.targetTaxYear?.toString() ?? "draft";

  return `${workspaceToken}-${yearToken}-tax-return.json`;
}

function buildJsonFile(path: string, value: unknown): WorkspaceFilingPackFile {
  return {
    path,
    mediaType: "application/json",
    contents: `${JSON.stringify(value, null, 2)}\n`
  };
}

function buildTextFile(path: string, lines: string[]): WorkspaceFilingPackFile {
  return {
    path,
    mediaType: "text/plain",
    contents: `${lines.join("\n")}\n`
  };
}

function formatChecklistStatus(status: WorkspaceChecklistItem["status"]) {
  return status.toUpperCase();
}

const seededFactLabels = new Map(seededFactDefinitions.map((definition) => [definition.id, definition.label]));

function isPendingReviewCoverage(coverage: ReturnWorkspaceRecord["documents"][number]["coverage"]) {
  return coverage === "partially-supported"
    || coverage === "planned"
    || coverage === "needs-review"
    || coverage === "unsupported";
}

function formatUnsupportedRouteFacts(route: ReturnWorkspaceRecord["returnSummary"]["items"][number]["relatedFactIds"]) {
  return route.map((factId) => seededFactLabels.get(factId) ?? factId).join(", ");
}

function formatUnsupportedRouteDocuments(
  route: ReturnWorkspaceRecord["returnSummary"]["items"][number]["sourceDocumentIds"],
  workspace: ReturnWorkspaceRecord
) {
  const documentsById = new Map(workspace.documents.map((document) => [document.id, document]));

  return route.map((documentId) => {
    const document = documentsById.get(documentId);

    return document
      ? `${document.label} :: ${document.name}`
      : documentId;
  }).join(" | ");
}

function buildFilingInstructions(workspace: ReturnWorkspaceRecord, generatedAt: string) {
  const lines = [
    "Tax Engine Self-Host Filing Instructions",
    "",
    `Workspace: ${workspace.id}`,
    `Generated from local data at: ${generatedAt}`,
    "This packet was generated locally in self-host mode. Keep it on a device you control."
  ];

  if (workspace.returnSummary.status === "ready-to-recompute" && workspace.enginePreview) {
    lines.push(
      "",
      `Deterministic recompute is ready for tax year ${workspace.enginePreview.taxYear}.`,
      `Current preview filing status: ${workspace.enginePreview.filingStatus}.`
    );

    if (workspace.enginePreview.metrics.refund !== "0") {
      lines.push(`Current engine preview refund: $${workspace.enginePreview.metrics.refund}.`);
    }

    if (workspace.enginePreview.metrics.amountOwed !== "0") {
      lines.push(`Current engine preview amount owed: $${workspace.enginePreview.metrics.amountOwed}.`);
    }

    lines.push(
      "Review return-summary.json, supporting-forms.json, and audit-trail.json before relying on the packet.",
      "Regenerate the filing pack after any document, interview, or coverage change."
    );

    return lines;
  }

  lines.push(
    "",
    "This workspace is not yet ready for deterministic self-filing.",
    "Review missing-items-memo.txt before relying on any draft amounts or checklist state.",
    "If unsupported-situations.txt is present, resolve those blockers or hand the return off for manual review."
  );

  return lines;
}

function buildMissingItemsMemo(workspace: ReturnWorkspaceRecord) {
  const pendingQuestions = workspace.seededReturn.interviewQuestions.filter(
    (question) => question.status === "pending"
  );
  const blockedChecklistItems = workspace.checklist.filter((item) => item.status !== "ready");
  const lines = [
    "Missing Items Memo",
    "",
    `Return status: ${workspace.returnSummary.status}`,
    `Interview confirmations remaining: ${workspace.summary.interviewQuestionsRemaining}`,
    `Pending review documents: ${workspace.summary.pendingReviewDocuments}`
  ];

  if (workspace.returnSummary.blockers.length > 0) {
    lines.push("", "Deterministic blockers:");

    for (const blocker of workspace.returnSummary.blockers) {
      lines.push(`- ${blocker.message}`);
    }
  }

  if (pendingQuestions.length > 0) {
    lines.push("", "Pending interview prompts:");

    for (const question of pendingQuestions) {
      lines.push(`- ${question.prompt}`);
    }
  }

  if (blockedChecklistItems.length > 0) {
    lines.push("", "Checklist items that still need work:");

    for (const item of blockedChecklistItems) {
      lines.push(`- [${formatChecklistStatus(item.status)}] ${item.label}`);
    }
  }

  if (workspace.seededReturn.reviewNotes.length > 0) {
    lines.push("", "Workspace review notes:");

    for (const note of workspace.seededReturn.reviewNotes) {
      lines.push(`- ${note}`);
    }
  }

  return buildTextFile("05-missing-items-memo.txt", lines);
}

function buildUnsupportedSituationsNotes(workspace: ReturnWorkspaceRecord) {
  const unsupportedDocuments = workspace.documents.filter((document) => isPendingReviewCoverage(document.coverage));
  const needsReviewItems = workspace.returnSummary.items.filter((item) => item.status === "needs-review");
  const unsupportedRoutes = buildWorkspaceUnsupportedRoutes(workspace);

  const lines = [
    "Unsupported Or Manual-Review Notes",
    "",
    "The following items prevent a fully deterministic filing pack."
  ];

  if (unsupportedDocuments.length > 0) {
    lines.push("", "Documents outside deterministic coverage:");

    for (const document of unsupportedDocuments) {
      lines.push(`- ${document.label} (${document.coverage}) :: ${document.name}`);
    }
  }

  if (needsReviewItems.length > 0) {
    lines.push("", "Return items that still require review:");

    for (const item of needsReviewItems) {
      lines.push(`- ${item.label} -> ${item.engineTargets.join(", ")}`);
    }
  }

  const reviewBlockers = workspace.returnSummary.blockers.filter((blocker) => blocker.id.startsWith("needs-review:"));

  if (reviewBlockers.length > 0) {
    lines.push("", "Review blockers:");

    for (const blocker of reviewBlockers) {
      lines.push(`- ${blocker.message}`);
    }
  }

  if (unsupportedRoutes.length > 0) {
    lines.push("", "Recommended next actions:");

    for (const route of unsupportedRoutes) {
      lines.push(`- [${route.urgency.toUpperCase()}] ${route.title}: ${route.description}`);

      if (route.reasons.length > 0) {
        lines.push(`  reasons: ${route.reasons.join(" | ")}`);
      }

      if (route.relatedFactIds.length > 0) {
        lines.push(`  related facts: ${formatUnsupportedRouteFacts(route.relatedFactIds)}`);
      }

      if (route.sourceDocumentIds.length > 0) {
        lines.push(`  source documents: ${formatUnsupportedRouteDocuments(route.sourceDocumentIds, workspace)}`);
      }
    }
  }

  return buildTextFile("06-unsupported-situations.txt", lines);
}

export interface BuildWorkspaceFilingPackOptions {
  generatedAt?: string;
}

export function buildWorkspaceFilingPack(
  workspace: ReturnWorkspaceRecord,
  options: BuildWorkspaceFilingPackOptions = {}
): WorkspaceFilingPack {
  const generatedAt = options.generatedAt ?? workspace.updatedAt;
  const downloadFileName = buildDownloadFileName(workspace);
  const supportingForms = {
    workspaceId: workspace.id,
    targetTaxYear: workspace.returnSummary.targetTaxYear,
    returnItems: workspace.returnSummary.items.map((item) => ({
      id: item.id,
      label: item.label,
      status: item.status,
      engineTargets: item.engineTargets,
      sourceDocumentIds: item.sourceDocumentIds
    })),
    highlightedLines: workspace.enginePreview?.highlightedLines ?? []
  };

  const contentFiles: WorkspaceFilingPackFile[] = [
    buildJsonFile("01-return-summary.json", {
      workspaceId: workspace.id,
      generatedAt,
      summary: workspace.summary,
      seededReturnStatus: workspace.seededReturn.status,
      returnSummary: workspace.returnSummary,
      enginePreview: workspace.enginePreview
    }),
    buildJsonFile("02-supporting-forms.json", supportingForms),
    buildJsonFile("03-checklist.json", {
      workspaceId: workspace.id,
      checklist: workspace.checklist
    }),
    buildTextFile("04-filing-instructions.txt", buildFilingInstructions(workspace, generatedAt)),
    buildJsonFile("07-audit-trail.json", {
      workspaceId: workspace.id,
      documents: workspace.documents,
      structuredFacts: workspace.structuredFacts,
      auditTrail: workspace.auditTrail
    })
  ];

  if (
    workspace.returnSummary.status !== "ready-to-recompute"
    || workspace.summary.interviewQuestionsRemaining > 0
    || workspace.summary.pendingReviewDocuments > 0
    || workspace.checklist.some((item) => item.status !== "ready")
  ) {
    contentFiles.splice(4, 0, buildMissingItemsMemo(workspace));
  }

  if (
    workspace.returnSummary.status === "needs-review"
    || workspace.documents.some((document) => isPendingReviewCoverage(document.coverage))
  ) {
    contentFiles.splice(contentFiles.length - 1, 0, buildUnsupportedSituationsNotes(workspace));
  }

  const manifestFiles: WorkspaceFilingPack["manifest"]["files"] = [
    {
      path: "00-manifest.json",
      mediaType: "application/json"
    },
    ...contentFiles.map((file) => ({
      path: file.path,
      mediaType: file.mediaType
    }))
  ];
  const manifest: WorkspaceFilingPack["manifest"] = {
    schemaVersion: 1,
    workspaceId: workspace.id,
    generatedAt,
    storageMode: workspace.storageMode,
    targetTaxYear: workspace.returnSummary.targetTaxYear,
    returnStatus: workspace.returnSummary.status,
    downloadFileName,
    localOnly: true,
    fileCount: manifestFiles.length,
    files: manifestFiles
  };
  const files: WorkspaceFilingPackFile[] = [
    buildJsonFile("00-manifest.json", manifest),
    ...contentFiles
  ];

  return {
    manifest,
    files
  };
}
