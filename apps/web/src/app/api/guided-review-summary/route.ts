import { NextResponse } from "next/server";
import type { GuidedReviewIssue } from "@/lib/guided-interview-flow";
import { summarizeGuidedReviewIssuesWithGemini } from "@/lib/gemini-document-analysis-server";

export const runtime = "nodejs";

function buildFallbackSummary(issues: GuidedReviewIssue[]) {
  if (issues.length === 0) {
    return "";
  }

  if (issues.length === 1) {
    const issue = issues[0];

    if (!issue) {
      return "";
    }

    return `${issue.sectionLabel} needs attention. ${issue.message} Open that section in the guided interview and resolve the highlighted item before continuing.`;
  }

  const labels = issues.map((issue) => issue.sectionLabel).join(", ");
  return `${issues.length} guided sections still need attention: ${labels}. Open the flagged sections below and resolve each missing or unconfirmed item before you continue.`;
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as { issues?: GuidedReviewIssue[] } | null;
  const issues = Array.isArray(body?.issues) ? body.issues : [];

  if (issues.length === 0) {
    return NextResponse.json({ summary: "" });
  }

  try {
    const summary = await summarizeGuidedReviewIssuesWithGemini(issues);
    return NextResponse.json({
      summary: summary ?? buildFallbackSummary(issues),
    });
  } catch {
    return NextResponse.json({
      summary: buildFallbackSummary(issues),
    });
  }
}
