import type { ReturnWorkspaceRecord } from "@tax-engine/contracts";
import type { GuidedFlowState } from "../../../../lib/guided-interview-flow";
import { resolveDeploymentMode } from "../../../../lib/deployment-mode";
import { resolveHostedWorkspaceActor } from "../../../../lib/hosted-auth";
import { shouldAllowLoopbackLocalWorkspaceApiAccess } from "../../../../lib/hosted-runtime-safety";
import { safeParseJsonBody } from "../../../../lib/safe-body-parser";
import { buildWorkspaceFilledReturnDownload } from "../../../../lib/workspace-filled-return";
import { cancelledDocumentRequest, createDocumentRequestProtection, privateJson } from "../../../../lib/protected-document-request";

const protect = createDocumentRequestProtection("filled-return");

function isReturnWorkspaceRecord(value: unknown): value is ReturnWorkspaceRecord {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<ReturnWorkspaceRecord>;

  return typeof candidate.id === "string"
    && Array.isArray(candidate.documents)
    && !!candidate.returnSummary
    && !!candidate.seededReturn
    && Array.isArray(candidate.structuredFacts);
}

function isGuidedFlowState(value: unknown): value is GuidedFlowState {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<GuidedFlowState>;

  return (
    (candidate.phase === "segmentation"
      || candidate.phase === "interview"
      || candidate.phase === "complete")
    && !!candidate.segmentation
    && typeof candidate.currentSectionIndex === "number"
    && Array.isArray(candidate.completedSections)
    && !!candidate.sectionData
  );
}

export async function POST(request: Request) {
  const protectedResponse = await protect(request);
  if (protectedResponse) return protectedResponse;
  const parsed = await safeParseJsonBody(request);
  if (request.signal.aborted) return cancelledDocumentRequest();

  if (!parsed.ok) {
    return privateJson({ error: parsed.error }, parsed.status);
  }

  const purpose = (parsed.data as { purpose?: unknown } | null)?.purpose;
  if (purpose !== undefined && purpose !== "review") {
    return privateJson({ error: "Filing exports are not qualified. Only review downloads are available." }, 400);
  }

  const workspace = isReturnWorkspaceRecord(parsed.data)
    ? parsed.data
    : isReturnWorkspaceRecord((parsed.data as { workspace?: unknown } | null)?.workspace)
      ? (parsed.data as { workspace: ReturnWorkspaceRecord }).workspace
      : null;
  const guidedFlowState = isGuidedFlowState((parsed.data as { guidedFlowState?: unknown } | null)?.guidedFlowState)
    ? (parsed.data as { guidedFlowState: GuidedFlowState }).guidedFlowState
    : null;

  if (!workspace) {
    return privateJson({ error: "Invalid workspace payload." }, 400);
  }

  const requestHostname = (() => {
    try {
      return new URL(request.url).hostname;
    } catch {
      return null;
    }
  })();
  const requiresHostedAuth = resolveDeploymentMode() === "hosted"
    && !shouldAllowLoopbackLocalWorkspaceApiAccess(
      process.env,
      requestHostname,
      workspace.storageMode
    );

  if (requiresHostedAuth) {
    try {
      const actor = await resolveHostedWorkspaceActor({ requestHeaders: request.headers });
      if (request.signal.aborted) return cancelledDocumentRequest();
      if (!actor) return privateJson({ error: "Authentication required before downloading a filled return." }, 401);
    } catch {
      return privateJson({ error: "Authentication is temporarily unavailable. Please try again later." }, 503);
    }
  }

  try {
    if (request.signal.aborted) return cancelledDocumentRequest();
    const download = await buildWorkspaceFilledReturnDownload(workspace, guidedFlowState);
    if (request.signal.aborted) return cancelledDocumentRequest();
    const pdfBlob = new Blob([Uint8Array.from(download.contents)], {
      type: "application/pdf"
    });

    return new Response(pdfBlob, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${download.fileName}"`,
        "X-Tax-Engine-Included-Forms": download.includedForms.join(","),
        "X-Tax-Engine-Export-Purpose": "review",
        "Cache-Control": "no-store, private",
      },
    });
  } catch {
    if (request.signal.aborted) return cancelledDocumentRequest();
    return privateJson({ error: "Could not generate the review PDF. Check required taxpayer facts, source documents and supported tax year." }, 400);
  }
}
