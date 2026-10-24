import { NextResponse } from "next/server";
import type { ReturnWorkspaceRecord } from "@tax-engine/contracts";
import type { GuidedFlowState } from "../../../../lib/guided-interview-flow";
import { resolveDeploymentMode } from "../../../../lib/deployment-mode";
import { resolveHostedWorkspaceActor } from "../../../../lib/hosted-auth";
import { shouldAllowLoopbackLocalWorkspaceApiAccess } from "../../../../lib/hosted-runtime-safety";
import { safeParseJsonBody } from "../../../../lib/safe-body-parser";
import { buildWorkspaceFilledReturnDownload } from "../../../../lib/workspace-filled-return";

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
  const parsed = await safeParseJsonBody(request);

  if (!parsed.ok) {
    return NextResponse.json(
      { error: parsed.error },
      { status: parsed.status }
    );
  }

  const purpose = (parsed.data as { purpose?: unknown } | null)?.purpose;
  if (purpose !== undefined && purpose !== "review") {
    return NextResponse.json({ error: "Filing exports are not qualified. Only review downloads are available." }, { status: 400 });
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
    return NextResponse.json(
      { error: "Invalid workspace payload." },
      { status: 400 }
    );
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
    const actor = await resolveHostedWorkspaceActor({
      requestHeaders: request.headers
    });

    if (!actor) {
      return NextResponse.json(
        { error: "Authentication required before downloading a filled return." },
        { status: 401 }
      );
    }
  }

  try {
    const download = await buildWorkspaceFilledReturnDownload(workspace, guidedFlowState);
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
  } catch (error) {
    const message = error instanceof Error && error.message
      ? error.message
      : "Could not generate the filled return PDF.";

    return NextResponse.json(
      { error: message },
      { status: 400 }
    );
  }
}
