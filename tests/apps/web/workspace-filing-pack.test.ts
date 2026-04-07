import { describe, expect, it } from "vitest";
import type { ReturnWorkspaceRecord } from "@tax-engine/contracts";
import { buildWorkspaceFilingPackDownload } from "../../../apps/web/src/lib/workspace-filing-pack";

function createWorkspace(): ReturnWorkspaceRecord {
  return {
    id: "workspace-download",
    createdAt: "2026-03-12T00:00:00.000Z",
    updatedAt: "2026-03-12T00:00:00.000Z",
    storageMode: "local-browser",
    documents: [],
    summary: {
      totalDocuments: 0,
      officialFixtureMatches: 0,
      supportedDocuments: 0,
      pendingReviewDocuments: 0,
      interviewQuestionsRemaining: 0
    },
    seededReturn: {
      status: "empty",
      taxYearHints: [],
      facts: [],
      interviewQuestions: [],
      interviewQueue: [],
      nextQuestionId: null,
      reviewNotes: []
    },
    structuredFacts: [],
    returnSummary: {
      status: "empty",
      targetTaxYear: null,
      taxYearState: "missing",
      answeredFactCount: 0,
      totalFactCount: 0,
      readyItemCount: 0,
      itemCount: 0,
      blockers: [],
      items: []
    },
    enginePreview: null,
    checklist: [
      { id: "documents", label: "Upload tax documents", status: "needs-input" },
      { id: "coverage", label: "Check document support", status: "needs-input" },
      { id: "interview", label: "Answer missing questions", status: "blocked" },
      { id: "review", label: "Review summary and completed return", status: "blocked" }
    ],
    auditTrail: []
  };
}

describe("workspace filing-pack download helper", () => {
  it("serializes the deterministic filing pack to a downloadable json payload", () => {
    const download = buildWorkspaceFilingPackDownload(createWorkspace());
    const parsed = JSON.parse(download.contents);

    expect(download.fileName).toBe("workspace-download-draft-tax-return.json");
    expect(download.contents.endsWith("\n")).toBe(true);
    expect(parsed.manifest.downloadFileName).toBe("workspace-download-draft-tax-return.json");
    expect(parsed.manifest.fileCount).toBe(7);
    expect(parsed.manifest.files).toEqual([
      { path: "00-manifest.json", mediaType: "application/json" },
      { path: "01-return-summary.json", mediaType: "application/json" },
      { path: "02-supporting-forms.json", mediaType: "application/json" },
      { path: "03-checklist.json", mediaType: "application/json" },
      { path: "04-filing-instructions.txt", mediaType: "text/plain" },
      { path: "05-missing-items-memo.txt", mediaType: "text/plain" },
      { path: "07-audit-trail.json", mediaType: "application/json" }
    ]);
    expect(parsed.files.map((file: { path: string }) => file.path)).toEqual([
      "00-manifest.json",
      "01-return-summary.json",
      "02-supporting-forms.json",
      "03-checklist.json",
      "04-filing-instructions.txt",
      "05-missing-items-memo.txt",
      "07-audit-trail.json"
    ]);
  });
});
