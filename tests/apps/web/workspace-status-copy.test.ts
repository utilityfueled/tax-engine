import { completePersonalInfo, completeW2Entry } from "../../guided-interview/complete-facts";
import { describe, expect, it } from "vitest";
import type { WorkspaceReturnSummary } from "@tax-engine/contracts";
import { createWorkspaceRecord, ingestFilesIntoWorkspace } from "../../../apps/web/src/lib/workspace-storage";
import type { GuidedFlowState } from "../../../apps/web/src/lib/guided-interview-flow";
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
  isUntouchedWorkspaceShell,
  summarizePendingInterviewQuestions,
  summarizeWorkspaceGuidedCompletion,
  summarizeGuidedSetupProgress
} from "../../../apps/web/src/lib/workspace-status-copy";

function createReturnSummary(overrides: Partial<WorkspaceReturnSummary> = {}): WorkspaceReturnSummary {
  return {
    status: "awaiting-interview",
    targetTaxYear: 2026,
    taxYearState: "single",
    answeredFactCount: 0,
    totalFactCount: 2,
    readyItemCount: 0,
    itemCount: 1,
    blockers: [{
      id: "unsupported-tax-year",
      message: "Tax year 2026 is not available for deterministic recompute yet. Latest supported engine year: 2025.",
      relatedFactIds: [],
      sourceDocumentIds: []
    }],
    items: [],
    ...overrides
  };
}

describe("workspace status copy", () => {
  it("surfaces unsupported tax-year warnings in filer-facing copy", () => {
    const returnSummary = createReturnSummary();

    expect(hasUnsupportedTaxYear(returnSummary)).toBe(true);
    expect(formatWorkspaceTaxYearSummary(returnSummary)).toBe("2026 not supported yet");
    expect(formatUnsupportedTaxYearNotice(returnSummary)).toBe(
      "Tax year 2026 is not available for deterministic recompute yet. Latest supported engine year: 2025."
    );
    expect(formatWorkspaceCalculationStatus(1, returnSummary)).toBe(
      "1 document matches supported forms but tax year 2026 cannot be calculated yet. Latest supported year: 2025."
    );
    expect(formatDocumentCoverageLabel("supported", returnSummary)).toBe("supported form");
    expect(formatDocumentCoverageNote("supported", returnSummary)).toBe(
      "This form is supported, but tax year 2026 cannot drive the engine yet. Latest supported year: 2025."
    );
  });

  it("keeps normal readiness copy for supported engine years", () => {
    const returnSummary = createReturnSummary({
      status: "ready-to-recompute",
      targetTaxYear: 2025,
      blockers: []
    });

    expect(hasUnsupportedTaxYear(returnSummary)).toBe(false);
    expect(formatWorkspaceTaxYearSummary(returnSummary)).toBe("2025");
    expect(formatUnsupportedTaxYearNotice(returnSummary)).toBeNull();
    expect(formatWorkspaceCalculationStatus(2, returnSummary)).toBe("2 documents ready for calculation");
    expect(formatDocumentCoverageLabel("supported", returnSummary)).toBe("supported");
    expect(formatDocumentCoverageNote("supported", returnSummary)).toBeNull();
  });

  it("treats reviewed uploads as non-blocking in filer-facing copy", () => {
    const returnSummary = createReturnSummary({
      status: "ready-to-recompute",
      targetTaxYear: 2025,
      blockers: []
    });

    expect(formatDocumentCoverageLabel("reviewed", returnSummary)).toBe("reviewed");
    expect(formatDocumentCoverageNote("reviewed", returnSummary)).toBe(
      "This upload has been reviewed and no longer blocks final return generation."
    );
  });

  it("presents a completed guided return as downloadable even with advisory uploads left", () => {
    const guidedFlowState: GuidedFlowState = {
      phase: "complete",
      segmentation: {
        filingStatus: "single",
        incomeTypes: ["w2-wages"],
        lifeEvents: [],
        stateCode: null
      },
      currentSectionIndex: 0,
      completedSections: ["personal-info", "income-w2", "deductions", "credits", "payments", "review"],
      sectionData: {
        deductions: {
          method: "standard",
          medicalExpenses: "",
          stateLocalTaxes: "",
          realEstateTaxes: "",
          mortgageInterest: "",
          charitableContributions: "",
          casualtyLosses: "",
          otherItemized: ""
        }
      }
    };

    expect(canPresentCompletedReturnDownload({
      returnSummary: createReturnSummary({
        status: "needs-review",
        targetTaxYear: 2025,
        blockers: [{
          id: "needs-review:unmapped-documents",
          message: "1 uploaded document still needs manual coverage review before deterministic recompute can run.",
          relatedFactIds: [],
          sourceDocumentIds: ["doc-review"]
        }]
      }),
      guidedFlowState,
      pendingInterviewQuestionCount: 0,
      guidedReviewIssueCount: 0,
      hasEnginePreview: false
    })).toBe(true);
  });

  it("treats review-only routes as advisory once the return bundle is otherwise ready", () => {
    expect(hasBlockingWorkspaceActions([
      { id: "review-filing-pack" },
      { id: "partner-review-later" }
    ], {
      pendingInterviewQuestionCount: 0,
      guidedReviewIssueCount: 0
    })).toBe(false);

    expect(hasBlockingWorkspaceActions([
      { id: "continue-interview" },
      { id: "review-filing-pack" }
    ], {
      pendingInterviewQuestionCount: 0,
      guidedReviewIssueCount: 0
    })).toBe(true);
  });

  it("surfaces saved guided setup before any documents are uploaded", () => {
    const guidedFlowState: GuidedFlowState = {
      phase: "interview",
      segmentation: {
        filingStatus: "single",
        incomeTypes: ["w2-wages"],
        lifeEvents: [],
        stateCode: null
      },
      currentSectionIndex: 1,
      completedSections: ["personal-info"],
      sectionData: {
        deductions: {
          method: "standard",
          medicalExpenses: "",
          stateLocalTaxes: "",
          realEstateTaxes: "",
          mortgageInterest: "",
          charitableContributions: "",
          casualtyLosses: "",
          otherItemized: ""
        },
        "personal-info": { ...completePersonalInfo }
      }
    };

    expect(summarizeGuidedSetupProgress(guidedFlowState)).toEqual({
      statusLabel: "Guided setup saved",
      progressLabel: "1 guided section saved",
      helperText: "Your guided interview is ready to resume at W-2 Wages."
    });
  });

  it("avoids review-ready copy when completed guided flow still has skipped sections", () => {
    const guidedFlowState: GuidedFlowState = {
      phase: "complete",
      segmentation: {
        filingStatus: "single",
        incomeTypes: ["w2-wages"],
        lifeEvents: [],
        stateCode: null
      },
      currentSectionIndex: 5,
      completedSections: ["personal-info", "income-w2", "deductions", "credits", "payments", "review"],
      sectionData: {
        deductions: {
          method: "standard",
          medicalExpenses: "",
          stateLocalTaxes: "",
          realEstateTaxes: "",
          mortgageInterest: "",
          charitableContributions: "",
          casualtyLosses: "",
          otherItemized: ""
        },
        "income-w2": {
          entries: [{
            ...completeW2Entry,
            wages: "50000",
          }]
        }
      }
    };

    expect(summarizeGuidedSetupProgress(guidedFlowState)).toEqual({
      statusLabel: "Guided setup saved",
      progressLabel: "5 of 7 guided sections complete",
      helperText: "Your guided interview is saved, but 1 section was skipped or still needs review."
    });
  });

  it("uses review copy when guided sections still need follow-up after sync", () => {
    expect(summarizeWorkspaceGuidedCompletion({
      skippedSectionCount: 1,
      needsReviewSectionCount: 1
    })).toEqual({
      statusLabel: "Needs review",
      progressLabel: "2 guided sections still need review",
      helperText: "Your guided interview answers are synced, but 2 sections were skipped or still need review before this return is ready."
    });
  });

  it("summarizes pending interview questions when answers are still required", () => {
    expect(summarizePendingInterviewQuestions([
      { status: "pending" },
      { status: "answered" },
      { status: "pending" },
    ])).toEqual({
      count: 2,
      progressLabel: "2 questions remaining",
      helperText: "2 return questions still need your answers before we can generate the final return."
    });
  });

  it("stays quiet when no interview questions are pending", () => {
    expect(summarizePendingInterviewQuestions([
      { status: "answered" },
      { status: "answered" },
    ])).toBeNull();
  });

  it("stays quiet when guided setup has not started yet", () => {
    const guidedFlowState: GuidedFlowState = {
      phase: "segmentation",
      segmentation: {
        filingStatus: null,
        incomeTypes: [],
        lifeEvents: [],
        stateCode: null
      },
      currentSectionIndex: 0,
      completedSections: [],
      sectionData: {}
    };

    expect(summarizeGuidedSetupProgress(guidedFlowState)).toBeNull();
  });

  it("flags untouched shell workspaces so the home page can hide them", () => {
    expect(isUntouchedWorkspaceShell(createWorkspaceRecord("shell-workspace"))).toBe(true);
  });

  it("keeps touched workspaces visible once the filer has added real data", () => {
    const workspace = ingestFilesIntoWorkspace(
      createWorkspaceRecord("active-workspace"),
      [{ name: "fw2--2026.pdf", size: 10 }]
    );

    expect(isUntouchedWorkspaceShell(workspace)).toBe(false);
  });

  it("separates guided synthetic docs from filer uploads in workspace counts", () => {
    const documents = [
      {
        id: "irs-w2-2025:irs-w2-2025.pdf:10",
        coverage: "supported" as const
      },
      {
        id: "guided:w2",
        coverage: "supported" as const
      },
      {
        id: "unknown:notes.pdf:5",
        coverage: "unsupported" as const
      }
    ];

    expect(countUploadedDocuments(documents)).toBe(2);
    expect(countGuidedSyntheticDocuments(documents)).toBe(1);
    expect(countUploadedSupportedDocuments(documents)).toBe(1);
  });
});
