import { syntheticStudentLoanFacts } from "../fixtures/student-loan-source";
import { completeNecSource, completeBusinessSection, completeBusinessExpenses } from "./complete-facts";
import { completeInterestSource } from "./complete-facts";
import { completePersonalInfo, completeW2Entry, completeSocialSecuritySource, completeSocialSecurityTreatment, completeUnemploymentSource } from "./complete-facts";
import { describe, it, expect } from "vitest";
import {
  type SegmentationAnswers,
  type GuidedFlowState,
  emptySegmentation,
  emptyPersonalInfo,
  emptyW2Entry,
  emptyNecEntry,
  emptyScheduleCExpenses,
  emptyInterestEntry,
  emptyDividendEntry,
  emptyBrokerageEntry,
  emptyCapitalGainTransaction,
  emptyDeductionData,
  emptyAdjustmentData,
  emptyCreditsData,
  emptyDependentCareData,
  emptyEducationCreditData,
  emptyEducationStudent,
  emptyEnergyCreditData,
  emptyOtherTaxesData,
  emptyPaymentData,
  emptyEstimatedPayment,
  emptyStateReturnData,
  emptyStateEstimatedPayment,
  emptyRetirementEntry,
  emptySocialSecurityData,
  emptyUnemploymentData,
  isSegmentationComplete,
  buildSectionRoute,
  computeFlowProgress,
  canGoBack,
  canGoForward,
  goToNextSection,
  goToPreviousSection,
  startInterview,
  jumpToSection,
  initialFlowState,
  updateSectionData,
  getSectionData,
  getGuidedFlowStorageKey,
  saveGuidedFlowState,
  loadGuidedFlowState,
  clearGuidedFlowState,
  getNextSegmentationStep,
  segmentationSteps,
  emptyDependentEntry,
  emptyRentalPropertyEntry,
  validateSection,
  shouldPromptBeforeAdvance,
  getStandardDeductionAmount,
  computeDeductionComparison,
  summarizeFlowCompletion,
  acceptSelfEmploymentIncomeSuggestion,
  collectGuidedReviewIssues,
  dismissSelfEmploymentIncomeSuggestion,
} from "@/lib/guided-interview-flow";
import {
  buildGuidedFactAnswers,
  buildGuidedSyntheticDocuments,
} from "@/lib/guided-interview-bridge";
import {
  createWorkspaceRecord,
  syncGuidedFlowToWorkspace,
} from "@/lib/workspace-storage";

// ── Segmentation completeness ──────────────────────────────────────────────

describe("isSegmentationComplete", () => {
  it("returns false for empty segmentation", () => {
    expect(isSegmentationComplete(emptySegmentation)).toBe(false);
  });

  it("returns true when filing status is selected", () => {
    const answers: SegmentationAnswers = {
      ...emptySegmentation,
      filingStatus: "single",
    };
    expect(isSegmentationComplete(answers)).toBe(true);
  });

  it("returns true even without income types or life events", () => {
    const answers: SegmentationAnswers = {
      filingStatus: "mfj",
      incomeTypes: [],
      lifeEvents: [],
      stateCode: null,
    };
    expect(isSegmentationComplete(answers)).toBe(true);
  });
});

// ── Section routing (skip logic) ───────────────────────────────────────────

describe("buildSectionRoute", () => {
  it("always includes personal-info, deductions, credits, payments, and review", () => {
    const sections = buildSectionRoute({
      filingStatus: "single",
      incomeTypes: [],
      lifeEvents: [],
      stateCode: null,
    });
    const ids = sections.map((s) => s.id);
    expect(ids).toContain("personal-info");
    expect(ids).toContain("deductions");
    expect(ids).toContain("credits");
    expect(ids).toContain("payments");
    expect(ids).toContain("review");
    expect(ids).toContain("final-review");
  });

  it("does not inject W-2 when no income types were selected", () => {
    const sections = buildSectionRoute({
      filingStatus: "single",
      incomeTypes: [],
      lifeEvents: [],
      stateCode: null,
    });
    const ids = sections.map((s) => s.id);
    expect(ids).not.toContain("income-w2");
    expect(ids).toEqual([
      "personal-info",
      "deductions",
      "credits",
      "payments",
      "review",
      "final-review",
    ]);
  });

  it("skips W-2 default when income types are explicitly selected", () => {
    const sections = buildSectionRoute({
      filingStatus: "single",
      incomeTypes: ["self-employment"],
      lifeEvents: [],
      stateCode: null,
    });
    const ids = sections.map((s) => s.id);
    expect(ids).not.toContain("income-w2");
    expect(ids).toContain("income-self-employment");
  });

  it("includes investment section when investments selected", () => {
    const sections = buildSectionRoute({
      filingStatus: "mfj",
      incomeTypes: ["w2-wages", "investments"],
      lifeEvents: [],
      stateCode: null,
    });
    const ids = sections.map((s) => s.id);
    expect(ids).toContain("income-w2");
    expect(ids).toContain("income-investments");
  });

  it("includes adjustments when self-employment selected", () => {
    const sections = buildSectionRoute({
      filingStatus: "single",
      incomeTypes: ["self-employment"],
      lifeEvents: [],
      stateCode: null,
    });
    const ids = sections.map((s) => s.id);
    expect(ids).toContain("adjustments");
    expect(ids).toContain("other-taxes");
  });

  it("includes adjustments when student loans life event selected", () => {
    const sections = buildSectionRoute({
      filingStatus: "single",
      incomeTypes: ["w2-wages"],
      lifeEvents: ["student-loans"],
      stateCode: null,
    });
    const ids = sections.map((s) => s.id);
    expect(ids).toContain("adjustments");
  });

  it("includes adjustments when HSA contributions life event selected", () => {
    const sections = buildSectionRoute({
      filingStatus: "single",
      incomeTypes: ["w2-wages"],
      lifeEvents: ["hsa-contributions"],
      stateCode: null,
    });
    const ids = sections.map((s) => s.id);
    expect(ids).toContain("adjustments");
  });

  it("excludes adjustments for simple W-2 filer with no relevant life events", () => {
    const sections = buildSectionRoute({
      filingStatus: "single",
      incomeTypes: ["w2-wages"],
      lifeEvents: [],
      stateCode: null,
    });
    const ids = sections.map((s) => s.id);
    expect(ids).not.toContain("adjustments");
  });

  it("excludes other-taxes when no self-employment", () => {
    const sections = buildSectionRoute({
      filingStatus: "single",
      incomeTypes: ["w2-wages"],
      lifeEvents: [],
      stateCode: null,
    });
    const ids = sections.map((s) => s.id);
    expect(ids).not.toContain("other-taxes");
  });

  it("includes state-return when a state is selected", () => {
    const sections = buildSectionRoute({
      filingStatus: "single",
      incomeTypes: [],
      lifeEvents: [],
      stateCode: "CA",
    });
    const ids = sections.map((s) => s.id);
    expect(ids).toContain("state-return");
  });

  it("excludes state-return when no state selected", () => {
    const sections = buildSectionRoute({
      filingStatus: "single",
      incomeTypes: [],
      lifeEvents: [],
      stateCode: null,
    });
    const ids = sections.map((s) => s.id);
    expect(ids).not.toContain("state-return");
  });

  it("simple W-2 filer gets minimal section set", () => {
    const sections = buildSectionRoute({
      filingStatus: "single",
      incomeTypes: ["w2-wages"],
      lifeEvents: [],
      stateCode: null,
    });
    const ids = sections.map((s) => s.id);
    expect(ids).toEqual([
      "personal-info",
      "income-w2",
      "deductions",
      "credits",
      "payments",
      "review",
      "final-review",
    ]);
  });

  it("complex filer gets full section set", () => {
    const sections = buildSectionRoute({
      filingStatus: "mfj",
      incomeTypes: ["w2-wages", "self-employment", "investments", "retirement"],
      lifeEvents: ["had-baby", "student-loans"],
      stateCode: "NY",
    });
    const ids = sections.map((s) => s.id);
    expect(ids).toEqual([
      "personal-info",
      "income-w2",
      "income-self-employment",
      "income-investments",
      "income-retirement",
      "adjustments",
      "deductions",
      "credits",
      "other-taxes",
      "payments",
      "review",
      "state-return",
      "final-review",
    ]);
  });
});

describe("self-employment income suggestion state helpers", () => {
  it("accepts an income suggestion and increments manual gross receipts", () => {
    const initialSection = {
      necEntries: [emptyNecEntry],
      manualGrossReceipts: "",
      expenses: emptyScheduleCExpenses,
      bankStatementAnalyses: [],
      incomeDocumentAnalyses: [
        {
          id: "analysis-1",
          fileName: "invoice.pdf",
          label: "Invoice",
          uploadedAt: "2026-03-29T00:00:00.000Z",
          summary: "One likely income amount found.",
          suggestions: [
            {
              id: "suggestion-1",
              date: "2025-01-31",
              description: "Invoice total",
              amount: "4500.00",
              confidence: "high" as const,
              reason: "Clearly labeled invoice total.",
              applied: false,
            },
          ],
        },
      ],
    };

    const nextSection = acceptSelfEmploymentIncomeSuggestion(
      initialSection,
      "analysis-1",
      "suggestion-1",
    );

    expect(nextSection.manualGrossReceipts).toBe("4500.00");
    expect(nextSection.incomeDocumentAnalyses?.[0]?.suggestions[0]?.applied).toBe(true);
  });

  it("dismisses an income suggestion without changing manual gross receipts", () => {
    const initialSection = {
      necEntries: [emptyNecEntry],
      manualGrossReceipts: "1200.00",
      expenses: emptyScheduleCExpenses,
      bankStatementAnalyses: [],
      incomeDocumentAnalyses: [
        {
          id: "analysis-1",
          fileName: "invoice.pdf",
          label: "Invoice",
          uploadedAt: "2026-03-29T00:00:00.000Z",
          summary: "One likely income amount found.",
          suggestions: [
            {
              id: "suggestion-1",
              date: "2025-01-31",
              description: "Invoice total",
              amount: "4500.00",
              confidence: "high" as const,
              reason: "Clearly labeled invoice total.",
              applied: false,
            },
          ],
        },
      ],
    };

    const nextSection = dismissSelfEmploymentIncomeSuggestion(
      initialSection,
      "analysis-1",
      "suggestion-1",
    );

    expect(nextSection.manualGrossReceipts).toBe("1200.00");
    expect(nextSection.incomeDocumentAnalyses?.[0]?.suggestions[0]?.dismissed).toBe(true);
    expect(nextSection.incomeDocumentAnalyses?.[0]?.suggestions[0]?.applied).toBe(false);
  });
});

describe("collectGuidedReviewIssues", () => {
  it("returns concrete section labels and messages for skipped or partial sections", () => {
    const state = startInterview({
      filingStatus: "single",
      incomeTypes: ["w2-wages"],
      lifeEvents: [],
      stateCode: null,
    });

    const withPartialW2 = updateSectionData(state, "income-w2", {
      entries: [
        {
          ...completeW2Entry,
          employerName: "Northwind Co",
          wages: "",
          federalWithheld: "",
        },
      ],
    });

    const markedVisited = {
      ...withPartialW2,
      completedSections: ["income-w2"],
    } satisfies GuidedFlowState;

    const issues = collectGuidedReviewIssues(markedVisited);

    expect(issues).toEqual([
      expect.objectContaining({
        sectionId: "income-w2",
        sectionLabel: "W-2 Wages",
        status: "needs-review",
        message: "Complete the actual W-2 identity, payroll and state facts.",
        actionLabel: "Review W-2 Wages",
      }),
    ]);
  });
});

// ── Progress calculation ───────────────────────────────────────────────────

describe("computeFlowProgress", () => {
  it("returns 0% for initial state", () => {
    const state = startInterview({
      filingStatus: "single",
      incomeTypes: ["w2-wages"],
      lifeEvents: [],
      stateCode: null,
    });
    const progress = computeFlowProgress(state);
    expect(progress.percentComplete).toBe(0);
    expect(progress.completedSections).toBe(0);
    expect(progress.currentSectionIndex).toBe(0);
  });

  it("computes progress after completing sections", () => {
    const state: GuidedFlowState = {
      phase: "interview",
      segmentation: {
        filingStatus: "single",
        incomeTypes: ["w2-wages"],
        lifeEvents: [],
        stateCode: null,
      },
      currentSectionIndex: 2,
      completedSections: ["personal-info", "income-w2"],
      sectionData: {
        deductions: emptyDeductionData,
        "personal-info": {
          ...completePersonalInfo,
          firstName: "Jane",
          lastName: "Doe",
        },
        "income-w2": {
          entries: [
            {
              ...completeW2Entry,
              employerName: "Acme",
              wages: "50000",
            },
          ],
        },
      },
    };
    const progress = computeFlowProgress(state);
    // 7 total sections for simple W-2 filer, 2 completed
    expect(progress.totalSections).toBe(7);
    expect(progress.completedSections).toBe(2);
    expect(progress.percentComplete).toBe(29);
  });

  it("ignores completed sections that are not in the current route", () => {
    const state: GuidedFlowState = {
      phase: "interview",
      segmentation: {
        filingStatus: "single",
        incomeTypes: ["w2-wages"],
        lifeEvents: [],
        stateCode: null,
      },
      currentSectionIndex: 0,
      completedSections: ["income-self-employment"], // not in route
      sectionData: {},
    };
    const progress = computeFlowProgress(state);
    expect(progress.completedSections).toBe(0);
  });

  it("does not count skipped sections as completed", () => {
    const state: GuidedFlowState = {
      phase: "interview",
      segmentation: {
        filingStatus: "single",
        incomeTypes: ["w2-wages"],
        lifeEvents: [],
        stateCode: null,
      },
      currentSectionIndex: 2,
      completedSections: ["personal-info", "income-w2"],
      sectionData: {
        deductions: emptyDeductionData,
        "income-w2": {
          entries: [
            {
              ...completeW2Entry,
              employerName: "Acme",
              wages: "50000",
            },
          ],
        },
      },
    };

    const progress = computeFlowProgress(state);

    expect(progress.completedSections).toBe(1);
    expect(progress.percentComplete).toBe(14);
  });
});

describe("summarizeFlowCompletion", () => {
  it("tracks skipped sections separately from completed ones", () => {
    const state: GuidedFlowState = {
      phase: "complete",
      segmentation: {
        filingStatus: "single",
        incomeTypes: ["w2-wages"],
        lifeEvents: [],
        stateCode: null,
      },
      currentSectionIndex: 5,
      completedSections: ["personal-info", "income-w2", "deductions", "credits", "payments", "review"],
      sectionData: {
        deductions: emptyDeductionData,
        "income-w2": {
          entries: [
            {
              ...completeW2Entry,
              employerName: "Acme",
              wages: "50000",
            },
          ],
        },
      },
    };

    expect(summarizeFlowCompletion(state)).toMatchObject({
      totalSections: 7,
      completedSections: 5,
      skippedSections: 1,
      needsReviewSections: 0,
    });
  });

  it("treats explicitly skipped optional sections as complete", () => {
    const state: GuidedFlowState = {
      phase: "complete",
      segmentation: {
        filingStatus: "single",
        incomeTypes: ["self-employment"],
        lifeEvents: [],
        stateCode: null,
      },
      currentSectionIndex: 7,
      completedSections: [
        "personal-info",
        "income-self-employment",
        "adjustments",
        "deductions",
        "credits",
        "other-taxes",
        "payments",
        "review",
      ],
      sectionData: {
        "personal-info": {
          ...completePersonalInfo,
          firstName: "Jane",
          lastName: "Doe",
        },
        "income-self-employment": {
          ...completeBusinessSection,
          necEntries: [],
          manualGrossReceipts: "12000",
          expenses: completeBusinessExpenses,
        },
        deductions: emptyDeductionData,
      },
    };

    expect(summarizeFlowCompletion(state)).toMatchObject({
      totalSections: 9,
      completedSections: 8,
      skippedSections: 0,
      needsReviewSections: 0,
    });
  });
});

// ── Navigation ─────────────────────────────────────────────────────────────

describe("navigation", () => {
  const simpleSegmentation: SegmentationAnswers = {
    filingStatus: "single",
    incomeTypes: ["w2-wages"],
    lifeEvents: [],
    stateCode: null,
  };

  it("canGoBack is false at first section", () => {
    const state = startInterview(simpleSegmentation);
    expect(canGoBack(state)).toBe(false);
  });

  it("canGoBack is true after advancing", () => {
    const state = goToNextSection(startInterview(simpleSegmentation));
    expect(canGoBack(state)).toBe(true);
  });

  it("canGoForward is true before last section", () => {
    const state = startInterview(simpleSegmentation);
    expect(canGoForward(state)).toBe(true);
  });

  it("canGoForward is false at last section", () => {
    let state = startInterview(simpleSegmentation);
    const sections = buildSectionRoute(simpleSegmentation);
    // Advance to last section
    for (let i = 0; i < sections.length - 1; i++) {
      state = goToNextSection(state);
    }
    expect(canGoForward(state)).toBe(false);
  });

  it("goToNextSection marks current section as completed", () => {
    const state = startInterview(simpleSegmentation);
    const next = goToNextSection(state);
    expect(next.completedSections).toContain("personal-info");
    expect(next.currentSectionIndex).toBe(1);
  });

  it("goToNextSection sets phase to complete when advancing past last section", () => {
    let state = startInterview(simpleSegmentation);
    const sections = buildSectionRoute(simpleSegmentation);
    for (let i = 0; i < sections.length; i++) {
      state = goToNextSection(state);
    }
    expect(state.phase).toBe("complete");
  });

  it("goToPreviousSection decrements index", () => {
    const state = goToNextSection(startInterview(simpleSegmentation));
    const prev = goToPreviousSection(state);
    expect(prev.currentSectionIndex).toBe(0);
  });

  it("goToPreviousSection does nothing at index 0", () => {
    const state = startInterview(simpleSegmentation);
    const prev = goToPreviousSection(state);
    expect(prev.currentSectionIndex).toBe(0);
  });

  it("jumpToSection moves to the correct index", () => {
    const state = startInterview(simpleSegmentation);
    const jumped = jumpToSection(state, "deductions");
    const sections = buildSectionRoute(simpleSegmentation);
    const expectedIndex = sections.findIndex((s) => s.id === "deductions");
    expect(jumped.currentSectionIndex).toBe(expectedIndex);
  });

  it("jumpToSection does nothing for a section not in the route", () => {
    const state = startInterview(simpleSegmentation);
    const jumped = jumpToSection(state, "income-rental");
    expect(jumped.currentSectionIndex).toBe(0);
  });
});

// ── Initial state ──────────────────────────────────────────────────────────

describe("initialFlowState", () => {
  it("starts in segmentation phase", () => {
    expect(initialFlowState.phase).toBe("segmentation");
  });

  it("has empty segmentation answers", () => {
    expect(initialFlowState.segmentation).toEqual(emptySegmentation);
  });

  it("has no completed sections", () => {
    expect(initialFlowState.completedSections).toEqual([]);
  });
});

// ── startInterview ─────────────────────────────────────────────────────────

describe("startInterview", () => {
  it("transitions to interview phase with defaulted deduction state", () => {
    const state = startInterview({
      filingStatus: "hoh",
      incomeTypes: ["w2-wages", "investments"],
      lifeEvents: ["had-baby"],
      stateCode: "PA",
    });
    expect(state.phase).toBe("interview");
    expect(state.currentSectionIndex).toBe(0);
    expect(state.completedSections).toEqual([]);
    expect(state.segmentation.filingStatus).toBe("hoh");
    expect(state.sectionData).toEqual({ deductions: emptyDeductionData });
  });
});

// ── Section data management ────────────────────────────────────────────────

describe("updateSectionData", () => {
  const base = startInterview({
    filingStatus: "single",
    incomeTypes: ["w2-wages"],
    lifeEvents: [],
    stateCode: null,
  });

  it("stores personal-info data", () => {
    const data = { ...emptyPersonalInfo, firstName: "Jane", lastName: "Doe" };
    const next = updateSectionData(base, "personal-info", data);
    expect(next.sectionData["personal-info"]).toEqual(data);
  });

  it("stores W-2 entries", () => {
    const entries = [{ ...completeW2Entry, employerName: "Acme", wages: "50000" }];
    const next = updateSectionData(base, "income-w2", { entries });
    expect(next.sectionData["income-w2"]).toEqual({ entries });
  });

  it("preserves other section data when updating one section", () => {
    const personalData = { ...emptyPersonalInfo, firstName: "Jane" };
    const w2Entries = [{ ...completeW2Entry, wages: "50000" }];
    const withPersonal = updateSectionData(base, "personal-info", personalData);
    const withBoth = updateSectionData(withPersonal, "income-w2", { entries: w2Entries });
    expect(withBoth.sectionData["personal-info"]).toEqual(personalData);
    expect(withBoth.sectionData["income-w2"]).toEqual({ entries: w2Entries });
  });

  it("overwrites previous data for the same section", () => {
    const first = updateSectionData(base, "personal-info", { ...emptyPersonalInfo, firstName: "Jane" });
    const second = updateSectionData(first, "personal-info", { ...emptyPersonalInfo, firstName: "John" });
    const data = getSectionData(second, "personal-info");
    expect(data?.firstName).toBe("John");
  });

  it("does not mutate the original state", () => {
    const data = { ...emptyPersonalInfo, firstName: "Jane" };
    const next = updateSectionData(base, "personal-info", data);
    expect(base.sectionData).toEqual({ deductions: emptyDeductionData });
    expect(next.sectionData["personal-info"]).toEqual(data);
  });
});

describe("getSectionData", () => {
  it("returns undefined for unset sections", () => {
    const state = startInterview({
      filingStatus: "single",
      incomeTypes: ["w2-wages"],
      lifeEvents: [],
      stateCode: null,
    });
    expect(getSectionData(state, "personal-info")).toBeUndefined();
    expect(getSectionData(state, "income-w2")).toBeUndefined();
  });

  it("returns stored data after update", () => {
    const state = startInterview({
      filingStatus: "single",
      incomeTypes: ["w2-wages"],
      lifeEvents: [],
      stateCode: null,
    });
    const data = { ...emptyPersonalInfo, city: "Portland" };
    const updated = updateSectionData(state, "personal-info", data);
    expect(getSectionData(updated, "personal-info")).toEqual(data);
  });
});

// ── Section data preserved through navigation ──────────────────────────────

describe("navigation preserves sectionData", () => {
  const simpleSegmentation: SegmentationAnswers = {
    filingStatus: "single",
    incomeTypes: ["w2-wages"],
    lifeEvents: [],
    stateCode: null,
  };

  it("goToNextSection keeps sectionData", () => {
    const state = startInterview(simpleSegmentation);
    const withData = updateSectionData(state, "personal-info", { ...emptyPersonalInfo, firstName: "Test" });
    const next = goToNextSection(withData);
    expect(getSectionData(next, "personal-info")?.firstName).toBe("Test");
  });

  it("goToPreviousSection keeps sectionData", () => {
    const state = goToNextSection(startInterview(simpleSegmentation));
    const withData = updateSectionData(state, "income-w2", { entries: [{ ...completeW2Entry, wages: "75000" }] });
    const prev = goToPreviousSection(withData);
    expect(getSectionData(prev, "income-w2")).toEqual({ entries: [{ ...completeW2Entry, wages: "75000" }] });
  });

  it("jumpToSection keeps sectionData", () => {
    const state = startInterview(simpleSegmentation);
    const withData = updateSectionData(state, "personal-info", { ...emptyPersonalInfo, lastName: "Smith" });
    const jumped = jumpToSection(withData, "deductions");
    expect(getSectionData(jumped, "personal-info")?.lastName).toBe("Smith");
  });
});

// ── initialFlowState includes sectionData ──────────────────────────────────

describe("initialFlowState sectionData", () => {
  it("has empty sectionData", () => {
    expect(initialFlowState.sectionData).toEqual({});
  });
});

// ── 1099-NEC / self-employment data model ──────────────────────────────────

describe("emptyNecEntry", () => {
  it("has all string fields initialized to empty", () => {
    expect(emptyNecEntry).toEqual({
      payerName: "",
      payerTin: "",
      nonemployeeCompensation: "",
      federalWithheld: "",
    });
  });
});

describe("emptyScheduleCExpenses", () => {
  it("has all expense categories initialized to empty", () => {
    expect(emptyScheduleCExpenses.advertising).toBe("");
    expect(emptyScheduleCExpenses.carAndTruck).toBe("");
    expect(emptyScheduleCExpenses.insurance).toBe("");
    expect(emptyScheduleCExpenses.officeExpense).toBe("");
    expect(emptyScheduleCExpenses.supplies).toBe("");
    expect(emptyScheduleCExpenses.travel).toBe("");
    expect(emptyScheduleCExpenses.meals).toBe("");
    expect(emptyScheduleCExpenses.utilities).toBe("");
    expect(emptyScheduleCExpenses.otherExpenses).toBe("");
  });
});

describe("self-employment section data", () => {
  const seSegmentation: SegmentationAnswers = {
    filingStatus: "single",
    incomeTypes: ["self-employment"],
    lifeEvents: [],
    stateCode: null,
  };

  it("stores 1099-NEC entries and Schedule C expenses", () => {
    const state = startInterview(seSegmentation);
    const necEntries = [
      { ...emptyNecEntry, payerName: "Acme Corp", nonemployeeCompensation: "5000" },
      { ...emptyNecEntry, payerName: "Beta LLC", nonemployeeCompensation: "3000" },
    ];
    const expenses = { ...emptyScheduleCExpenses, officeExpense: "500", supplies: "200" };
    const updated = updateSectionData(state, "income-self-employment", {
      necEntries,
      expenses,
      bankStatementAnalyses: [{
        id: "statement-1",
        fileName: "statement.pdf",
        label: "Northwind Checking",
        uploadedAt: "2026-03-28T00:00:00.000Z",
        summary: "One likely office expense found.",
        suggestions: [{
          id: "statement-1-1",
          date: "2025-01-08",
          description: "Office Depot",
          amount: "84.91",
          suggestedCategory: "officeExpense",
          suggestedBusinessUse: true,
          confidence: "high",
          reason: "Office supply merchant.",
          appliedCategory: null,
        }],
      }],
    });
    const data = getSectionData(updated, "income-self-employment");
    expect(data?.necEntries).toHaveLength(2);
    expect(data?.necEntries[0].payerName).toBe("Acme Corp");
    expect(data?.necEntries[1].nonemployeeCompensation).toBe("3000");
    expect(data?.expenses.officeExpense).toBe("500");
    expect(data?.expenses.supplies).toBe("200");
    expect(data?.bankStatementAnalyses?.[0]?.suggestions[0]?.suggestedCategory).toBe("officeExpense");
  });

  it("preserves self-employment data through navigation", () => {
    const state = startInterview(seSegmentation);
    const necEntries = [{ ...emptyNecEntry, payerName: "Client A", nonemployeeCompensation: "10000" }];
    const expenses = { ...emptyScheduleCExpenses, travel: "1500" };
    const withData = updateSectionData(state, "income-self-employment", { necEntries, expenses });
    const next = goToNextSection(withData);
    const prev = goToPreviousSection(next);
    const data = getSectionData(prev, "income-self-employment");
    expect(data?.necEntries[0].payerName).toBe("Client A");
    expect(data?.expenses.travel).toBe("1500");
  });

  it("coexists with W-2 and personal info data", () => {
    const state = startInterview({
      filingStatus: "single",
      incomeTypes: ["w2-wages", "self-employment"],
      lifeEvents: [],
      stateCode: null,
    });
    const withPersonal = updateSectionData(state, "personal-info", { ...emptyPersonalInfo, firstName: "Jane" });
    const withW2 = updateSectionData(withPersonal, "income-w2", { entries: [{ ...completeW2Entry, wages: "50000" }] });
    const withSE = updateSectionData(withW2, "income-self-employment", {
      necEntries: [{ ...emptyNecEntry, nonemployeeCompensation: "20000" }],
      expenses: emptyScheduleCExpenses,
    });
    expect(getSectionData(withSE, "personal-info")?.firstName).toBe("Jane");
    expect(getSectionData(withSE, "income-w2")?.entries[0].wages).toBe("50000");
    expect(getSectionData(withSE, "income-self-employment")?.necEntries[0].nonemployeeCompensation).toBe("20000");
  });
});

// ── Self-employment section routing ─────────────────────────────────────────

describe("self-employment section routing", () => {
  it("includes self-employment, adjustments, and other-taxes sections", () => {
    const sections = buildSectionRoute({
      filingStatus: "single",
      incomeTypes: ["self-employment"],
      lifeEvents: [],
      stateCode: null,
    });
    const ids = sections.map((s) => s.id);
    expect(ids).toContain("income-self-employment");
    expect(ids).toContain("adjustments");
    expect(ids).toContain("other-taxes");
  });

  it("places income-self-employment before adjustments", () => {
    const sections = buildSectionRoute({
      filingStatus: "single",
      incomeTypes: ["self-employment"],
      lifeEvents: [],
      stateCode: null,
    });
    const ids = sections.map((s) => s.id);
    const seIndex = ids.indexOf("income-self-employment");
    const adjIndex = ids.indexOf("adjustments");
    expect(seIndex).toBeLessThan(adjIndex);
  });

  it("progress calculation works for self-employment filer", () => {
    const seSegmentation: SegmentationAnswers = {
      filingStatus: "single",
      incomeTypes: ["self-employment"],
      lifeEvents: [],
      stateCode: null,
    };
    const state: GuidedFlowState = {
      phase: "interview",
      segmentation: seSegmentation,
      currentSectionIndex: 2,
      completedSections: ["personal-info", "income-self-employment"],
      sectionData: {
        deductions: emptyDeductionData,
        "personal-info": {
          ...completePersonalInfo,
          firstName: "Jane",
          lastName: "Doe",
        },
        "income-self-employment": {
          ...completeBusinessSection,
          necEntries: [
            {
              ...completeNecSource,
              payerName: "Client Co",
              nonemployeeCompensation: "12000",
            },
          ],
          expenses: completeBusinessExpenses,
        },
      },
    };
    const progress = computeFlowProgress(state);
    expect(progress.completedSections).toBe(2);
    expect(progress.totalSections).toBe(9); // personal, se, adjustments, deductions, credits, other-taxes, payments, review, final-review
    expect(progress.percentComplete).toBe(22);
  });
});

// ── Investment income data model ─────────────────────────────────────────

describe("emptyInterestEntry", () => {
  it("has all string fields initialized to empty", () => {
    expect(emptyInterestEntry).toEqual({
      payer: "",
      interestIncome: "",
      federalWithheld: "",
    });
  });
});

describe("emptyDividendEntry", () => {
  it("has all string fields initialized to empty", () => {
    expect(emptyDividendEntry).toEqual({
      payer: "",
      ordinaryDividends: "",
      qualifiedDividends: "",
      capitalGainDistributions: "",
      federalWithheld: "",
      section199ADividends: "",
      foreignTaxPaid: "",
    });
  });
});

describe("emptyCapitalGainTransaction", () => {
  it("leaves sale classification facts unanswered", () => {
    expect(emptyCapitalGainTransaction).toEqual({
      description: "",
      dateAcquired: "",
      dateSold: "",
      proceeds: "",
      costBasis: "",
      holdingPeriod: "",
      specialGainCharacter: "",
      basisReportedToIRS: null,
      digitalAsset: null,
      washSale: null,
      washSaleDisallowed: "",
      adjustments: "",
      sourceClassificationConfirmed: null,
    });
  });
});

describe("emptyBrokerageEntry", () => {
  it("has broker empty and one empty transaction", () => {
    expect(emptyBrokerageEntry.broker).toBe("");
    expect(emptyBrokerageEntry.transactions).toHaveLength(1);
    expect(emptyBrokerageEntry.transactions[0]).toEqual(emptyCapitalGainTransaction);
  });
});

describe("investment income section data", () => {
  const investSegmentation: SegmentationAnswers = {
    filingStatus: "single",
    incomeTypes: ["investments"],
    lifeEvents: [],
    stateCode: null,
  };

  it("stores interest, dividend, and brokerage entries", () => {
    const state = startInterview(investSegmentation);
    const interestEntries = [
      { ...emptyInterestEntry, payer: "Chase Bank", interestIncome: "150" },
    ];
    const dividendEntries = [
      { ...emptyDividendEntry, payer: "Vanguard", ordinaryDividends: "2000", qualifiedDividends: "1500" },
    ];
    const brokerageEntries = [
      {
        broker: "Fidelity",
        transactions: [
          { ...emptyCapitalGainTransaction, description: "100 AAPL", proceeds: "15000", costBasis: "10000", holdingPeriod: "long" as const },
        ],
      },
    ];
    const updated = updateSectionData(state, "income-investments", {
      interestEntries,
      dividendEntries,
      brokerageEntries,
    });
    const data = getSectionData(updated, "income-investments");
    expect(data?.interestEntries).toHaveLength(1);
    expect(data?.interestEntries[0].payer).toBe("Chase Bank");
    expect(data?.dividendEntries).toHaveLength(1);
    expect(data?.dividendEntries[0].qualifiedDividends).toBe("1500");
    expect(data?.brokerageEntries).toHaveLength(1);
    expect(data?.brokerageEntries[0].transactions[0].proceeds).toBe("15000");
  });

  it("preserves investment data through navigation", () => {
    const state = startInterview(investSegmentation);
    const interestEntries = [{ ...emptyInterestEntry, payer: "Ally Bank", interestIncome: "500" }];
    const dividendEntries = [{ ...emptyDividendEntry, payer: "Schwab", ordinaryDividends: "3000" }];
    const brokerageEntries = [emptyBrokerageEntry];
    const withData = updateSectionData(state, "income-investments", {
      interestEntries,
      dividendEntries,
      brokerageEntries,
    });
    const next = goToNextSection(withData);
    const prev = goToPreviousSection(next);
    const data = getSectionData(prev, "income-investments");
    expect(data?.interestEntries[0].payer).toBe("Ally Bank");
    expect(data?.dividendEntries[0].ordinaryDividends).toBe("3000");
  });

  it("coexists with W-2 and personal info data", () => {
    const state = startInterview({
      filingStatus: "single",
      incomeTypes: ["w2-wages", "investments"],
      lifeEvents: [],
      stateCode: null,
    });
    const withPersonal = updateSectionData(state, "personal-info", { ...emptyPersonalInfo, firstName: "Jane" });
    const withW2 = updateSectionData(withPersonal, "income-w2", { entries: [{ ...completeW2Entry, wages: "50000" }] });
    const withInvest = updateSectionData(withW2, "income-investments", {
      interestEntries: [{ ...emptyInterestEntry, interestIncome: "200" }],
      dividendEntries: [emptyDividendEntry],
      brokerageEntries: [emptyBrokerageEntry],
    });
    expect(getSectionData(withInvest, "personal-info")?.firstName).toBe("Jane");
    expect(getSectionData(withInvest, "income-w2")?.entries[0].wages).toBe("50000");
    expect(getSectionData(withInvest, "income-investments")?.interestEntries[0].interestIncome).toBe("200");
  });
});

// ── Investment section routing ───────────────────────────────────────────

describe("investment section routing", () => {
  it("includes income-investments when investments selected", () => {
    const sections = buildSectionRoute({
      filingStatus: "single",
      incomeTypes: ["investments"],
      lifeEvents: [],
      stateCode: null,
    });
    const ids = sections.map((s) => s.id);
    expect(ids).toContain("income-investments");
  });

  it("places income-investments after personal-info", () => {
    const sections = buildSectionRoute({
      filingStatus: "single",
      incomeTypes: ["w2-wages", "investments"],
      lifeEvents: [],
      stateCode: null,
    });
    const ids = sections.map((s) => s.id);
    const personalIndex = ids.indexOf("personal-info");
    const investIndex = ids.indexOf("income-investments");
    expect(investIndex).toBeGreaterThan(personalIndex);
  });

  it("progress calculation works for investment filer", () => {
    const investSegmentation: SegmentationAnswers = {
      filingStatus: "single",
      incomeTypes: ["w2-wages", "investments"],
      lifeEvents: [],
      stateCode: null,
    };
    const state: GuidedFlowState = {
      phase: "interview",
      segmentation: investSegmentation,
      currentSectionIndex: 3,
      completedSections: ["personal-info", "income-w2", "income-investments"],
      sectionData: {
        deductions: emptyDeductionData,
        "personal-info": {
          ...completePersonalInfo,
          firstName: "Jane",
          lastName: "Doe",
        },
        "income-w2": {
          entries: [
            {
              ...completeW2Entry,
              employerName: "Acme",
              wages: "50000",
            },
          ],
        },
        "income-investments": {
          interestEntries: [
            {
              ...completeInterestSource,
              payer: "Bank",
              interestIncome: "250",
            },
          ],
          dividendEntries: [],
          brokerageEntries: [],
        },
      },
    };
    const progress = computeFlowProgress(state);
    expect(progress.completedSections).toBe(3);
    // personal, w2, investments, deductions, credits, other-taxes, payments, review, final-review = 9
    expect(progress.totalSections).toBe(9);
    expect(progress.percentComplete).toBe(33);
  });
});

// ── Review section routing ─────────────────────────────────────────────────

describe("review section in flow", () => {
  it("review section is always included in the route", () => {
    const sections = buildSectionRoute({
      filingStatus: "single",
      incomeTypes: ["w2-wages"],
      lifeEvents: [],
      stateCode: null,
    });
    const ids = sections.map((s) => s.id);
    expect(ids).toContain("review");
  });

  it("review is immediately before state-return when a state return is included", () => {
    const sections = buildSectionRoute({
      filingStatus: "single",
      incomeTypes: ["w2-wages"],
      lifeEvents: [],
      stateCode: "CA",
    });
    const ids = sections.map((s) => s.id);
    const reviewIndex = ids.indexOf("review");
    const stateIndex = ids.indexOf("state-return");
    expect(reviewIndex).toBe(stateIndex - 1);
  });

  it("review is the last section when no state selected", () => {
    const sections = buildSectionRoute({
      filingStatus: "single",
      incomeTypes: ["w2-wages"],
      lifeEvents: [],
      stateCode: null,
    });
    const ids = sections.map((s) => s.id);
    const reviewIndex = ids.indexOf("review");
    expect(reviewIndex).toBe(ids.length - 2);
    expect(ids[ids.length - 1]).toBe("final-review");
  });

  it("navigating to review preserves all section data", () => {
    let state = startInterview({
      filingStatus: "single",
      incomeTypes: ["w2-wages"],
      lifeEvents: [],
      stateCode: null,
    });
    // Enter personal info and W-2 data
    state = updateSectionData(state, "personal-info", { ...emptyPersonalInfo, firstName: "Jane", lastName: "Doe" });
    state = updateSectionData(state, "income-w2", { entries: [{ ...completeW2Entry, wages: "75000", federalWithheld: "10000" }] });

    // Navigate to review (last section for simple W-2 filer = index 5)
    const sections = buildSectionRoute(state.segmentation);
    const reviewIndex = sections.findIndex((s) => s.id === "review");
    const jumped = jumpToSection(state, "review");

    expect(jumped.currentSectionIndex).toBe(reviewIndex);
    expect(getSectionData(jumped, "personal-info")?.firstName).toBe("Jane");
    expect(getSectionData(jumped, "income-w2")?.entries[0].wages).toBe("75000");
  });

  it("canGoForward is false at final-review when it is the last section", () => {
    const segmentation: SegmentationAnswers = {
      filingStatus: "single",
      incomeTypes: ["w2-wages"],
      lifeEvents: [],
      stateCode: null,
    };
    let state = startInterview(segmentation);
    const sections = buildSectionRoute(segmentation);
    // Navigate to last section (final-review)
    for (let i = 0; i < sections.length - 1; i++) {
      state = goToNextSection(state);
    }
    expect(sections[state.currentSectionIndex].id).toBe("final-review");
    expect(canGoForward(state)).toBe(false);
  });

  it("going forward from review transitions to complete phase", () => {
    const segmentation: SegmentationAnswers = {
      filingStatus: "single",
      incomeTypes: ["w2-wages"],
      lifeEvents: [],
      stateCode: null,
    };
    let state = startInterview(segmentation);
    const sections = buildSectionRoute(segmentation);
    // Navigate through all sections including review
    for (let i = 0; i < sections.length; i++) {
      state = goToNextSection(state);
    }
    expect(state.phase).toBe("complete");
    expect(state.completedSections).toContain("review");
  });
});

// ── Deduction data model ──────────────────────────────────────────────────

describe("emptyDeductionData", () => {
  it("defaults to standard method with empty fields", () => {
    expect(emptyDeductionData.method).toBe("standard");
    expect(emptyDeductionData.medicalExpenses).toBe("");
    expect(emptyDeductionData.stateLocalTaxes).toBe("");
    expect(emptyDeductionData.realEstateTaxes).toBe("");
    expect(emptyDeductionData.mortgageInterest).toBe("");
    expect(emptyDeductionData.charitableContributions).toBe("");
    expect(emptyDeductionData.casualtyLosses).toBe("");
    expect(emptyDeductionData.otherItemized).toBe("");
  });
});

describe("deduction section data", () => {
  const simpleSegmentation: SegmentationAnswers = {
    filingStatus: "single",
    incomeTypes: ["w2-wages"],
    lifeEvents: [],
    stateCode: null,
  };

  it("seeds the standard deduction choice before the filer interacts with the section", () => {
    const state = startInterview(simpleSegmentation);
    expect(getSectionData(state, "deductions")).toEqual(emptyDeductionData);
  });

  it("stores deduction method and itemized amounts", () => {
    const state = startInterview(simpleSegmentation);
    const updated = updateSectionData(state, "deductions", {
      ...emptyDeductionData,
      method: "itemized",
      mortgageInterest: "12000",
      charitableContributions: "5000",
    });
    const data = getSectionData(updated, "deductions");
    expect(data?.method).toBe("itemized");
    expect(data?.mortgageInterest).toBe("12000");
    expect(data?.charitableContributions).toBe("5000");
  });

  it("preserves deduction data through navigation", () => {
    const state = startInterview(simpleSegmentation);
    const withData = updateSectionData(state, "deductions", {
      ...emptyDeductionData,
      method: "standard",
    });
    const next = goToNextSection(withData);
    const prev = goToPreviousSection(next);
    expect(getSectionData(prev, "deductions")?.method).toBe("standard");
  });

  it("coexists with other section data", () => {
    let state = startInterview(simpleSegmentation);
    state = updateSectionData(state, "personal-info", { ...emptyPersonalInfo, firstName: "Jane" });
    state = updateSectionData(state, "income-w2", { entries: [{ ...completeW2Entry, wages: "50000" }] });
    state = updateSectionData(state, "deductions", { ...emptyDeductionData, method: "itemized", mortgageInterest: "8000" });
    expect(getSectionData(state, "personal-info")?.firstName).toBe("Jane");
    expect(getSectionData(state, "income-w2")?.entries[0].wages).toBe("50000");
    expect(getSectionData(state, "deductions")?.mortgageInterest).toBe("8000");
  });
});

// ── Adjustment data model ─────────────────────────────────────────────────

describe("emptyAdjustmentData", () => {
  it("has all fields initialized to empty strings", () => {
    expect(emptyAdjustmentData.hsaDeduction).toBe("");
    expect(emptyAdjustmentData.studentLoanInterest).toBe("");
    expect(emptyAdjustmentData.selfEmployedHealthInsurance).toBe("");
    expect(emptyAdjustmentData.educatorExpenses).toBe("");
    expect(emptyAdjustmentData.iraDeduction).toBe("");
    expect(emptyAdjustmentData.alimonyPaid).toBe("");
  });
});

describe("adjustment section data", () => {
  const seSegmentation: SegmentationAnswers = {
    filingStatus: "single",
    incomeTypes: ["self-employment"],
    lifeEvents: ["student-loans", "hsa-contributions"],
    stateCode: null,
  };

  it("stores adjustment amounts", () => {
    const state = startInterview(seSegmentation);
    const updated = updateSectionData(state, "adjustments", {
      ...emptyAdjustmentData,
      hsaDeduction: "3600",
      studentLoanInterest: "2500",
      selfEmployedHealthInsurance: "6000",
    });
    const data = getSectionData(updated, "adjustments");
    expect(data?.hsaDeduction).toBe("3600");
    expect(data?.studentLoanInterest).toBe("2500");
    expect(data?.selfEmployedHealthInsurance).toBe("6000");
  });

  it("preserves adjustment data through navigation", () => {
    const state = startInterview(seSegmentation);
    const withData = updateSectionData(state, "adjustments", {
      ...emptyAdjustmentData,
      educatorExpenses: "300",
    });
    const next = goToNextSection(withData);
    const prev = goToPreviousSection(next);
    expect(getSectionData(prev, "adjustments")?.educatorExpenses).toBe("300");
  });
});

// ── Payment data model ────────────────────────────────────────────────────

describe("emptyPaymentData", () => {
  it("has empty estimated payments array and empty other payments", () => {
    expect(emptyPaymentData.estimatedPayments).toEqual([]);
    expect(emptyPaymentData.otherPayments).toBe("");
  });
});

describe("emptyEstimatedPayment", () => {
  it("has empty date and amount", () => {
    expect(emptyEstimatedPayment.date).toBe("");
    expect(emptyEstimatedPayment.amount).toBe("");
  });
});

describe("payment section data", () => {
  const simpleSegmentation: SegmentationAnswers = {
    filingStatus: "single",
    incomeTypes: ["self-employment"],
    lifeEvents: [],
    stateCode: null,
  };

  it("stores estimated payment entries", () => {
    const state = startInterview(simpleSegmentation);
    const updated = updateSectionData(state, "payments", {
      estimatedPayments: [
        { date: "2025-04-15", amount: "5000" },
        { date: "2025-06-15", amount: "5000" },
      ],
      otherPayments: "",
    });
    const data = getSectionData(updated, "payments");
    expect(data?.estimatedPayments).toHaveLength(2);
    expect(data?.estimatedPayments[0].amount).toBe("5000");
    expect(data?.estimatedPayments[1].date).toBe("2025-06-15");
  });

  it("preserves payment data through navigation", () => {
    const state = startInterview(simpleSegmentation);
    const withData = updateSectionData(state, "payments", {
      estimatedPayments: [{ date: "2025-04-15", amount: "3000" }],
      otherPayments: "500",
    });
    const next = goToNextSection(withData);
    const prev = goToPreviousSection(next);
    const data = getSectionData(prev, "payments");
    expect(data?.estimatedPayments[0].amount).toBe("3000");
    expect(data?.otherPayments).toBe("500");
  });

  it("coexists with income and deduction data", () => {
    let state = startInterview(simpleSegmentation);
    state = updateSectionData(state, "income-self-employment", {
      necEntries: [{ ...emptyNecEntry, nonemployeeCompensation: "80000" }],
      expenses: emptyScheduleCExpenses,
    });
    state = updateSectionData(state, "deductions", emptyDeductionData);
    state = updateSectionData(state, "payments", {
      estimatedPayments: [{ date: "2025-04-15", amount: "10000" }],
      otherPayments: "",
    });
    expect(getSectionData(state, "income-self-employment")?.necEntries[0].nonemployeeCompensation).toBe("80000");
    expect(getSectionData(state, "deductions")?.method).toBe("standard");
    expect(getSectionData(state, "payments")?.estimatedPayments[0].amount).toBe("10000");
  });
});

// ── Credits data storage ────────────────────────────────────────────────────

describe("Credits section data", () => {
  const simpleSegmentation: SegmentationAnswers = {
    filingStatus: "single",
    incomeTypes: ["w2-wages"],
    lifeEvents: [],
    stateCode: null,
  };

  it("stores and retrieves credits data with dependent care", () => {
    let state = startInterview(simpleSegmentation);
    state = updateSectionData(state, "credits", {
      ...emptyCreditsData,
      dependentCare: { expenses: "5000", qualifyingIndividuals: "2" },
    });
    const data = getSectionData(state, "credits");
    expect(data?.dependentCare.expenses).toBe("5000");
    expect(data?.dependentCare.qualifyingIndividuals).toBe("2");
  });

  it("stores and retrieves credits data with education", () => {
    let state = startInterview(simpleSegmentation);
    state = updateSectionData(state, "credits", {
      ...emptyCreditsData,
      education: {
        aocStudents: [{ name: "Jane", qualifiedExpenses: "4000", priorYearsClaimed: "1" }],
        llcExpenses: "2000",
      },
    });
    const data = getSectionData(state, "credits");
    expect(data?.education.aocStudents).toHaveLength(1);
    expect(data?.education.aocStudents[0].name).toBe("Jane");
    expect(data?.education.llcExpenses).toBe("2000");
  });

  it("stores and retrieves credits data with energy", () => {
    let state = startInterview(simpleSegmentation);
    state = updateSectionData(state, "credits", {
      ...emptyCreditsData,
      energy: { ...emptyEnergyCreditData, solarElectricCost: "20000" },
    });
    const data = getSectionData(state, "credits");
    expect(data?.energy.solarElectricCost).toBe("20000");
  });

  it("empty defaults have sensible zero-state values", () => {
    expect(emptyCreditsData.dependentCare.expenses).toBe("");
    expect(emptyCreditsData.education.aocStudents).toHaveLength(0);
    expect(emptyCreditsData.energy.solarElectricCost).toBe("");
    expect(emptyEducationStudent.qualifiedExpenses).toBe("");
    expect(emptyDependentCareData.qualifyingIndividuals).toBe("");
  });
});

// ── Retirement income section data ──────────────────────────────────────

describe("retirement income section data", () => {
  const retirementSegmentation: SegmentationAnswers = {
    filingStatus: "single",
    incomeTypes: ["retirement"],
    lifeEvents: [],
    stateCode: null,
  };

  it("routes to income-retirement section when retirement selected", () => {
    const sections = buildSectionRoute(retirementSegmentation);
    const ids = sections.map((s) => s.id);
    expect(ids).toContain("income-retirement");
  });

  it("does not include income-retirement when retirement not selected", () => {
    const sections = buildSectionRoute({
      filingStatus: "single",
      incomeTypes: ["w2-wages"],
      lifeEvents: [],
      stateCode: null,
    });
    const ids = sections.map((s) => s.id);
    expect(ids).not.toContain("income-retirement");
  });

  it("stores and retrieves 1099-R entries", () => {
    const state = startInterview(retirementSegmentation);
    const entries = [
      { ...emptyRetirementEntry, payer: "Fidelity", grossDistribution: "25000", taxableAmount: "25000" },
    ];
    const updated = updateSectionData(state, "income-retirement", { entries });
    const data = getSectionData(updated, "income-retirement");
    expect(data?.entries).toHaveLength(1);
    expect(data?.entries[0].payer).toBe("Fidelity");
    expect(data?.entries[0].grossDistribution).toBe("25000");
  });

  it("emptyRetirementEntry has sensible defaults", () => {
    expect(emptyRetirementEntry.payer).toBe("");
    expect(emptyRetirementEntry.grossDistribution).toBe("");
    expect(emptyRetirementEntry.taxableAmount).toBe("");
    expect(emptyRetirementEntry.federalWithheld).toBe("");
    expect(emptyRetirementEntry.isIraSepSimple).toBeNull();
    expect(emptyRetirementEntry.distributionCode).toBe("");
  });
});

// ── Social security section data ────────────────────────────────────────

describe("social security section data", () => {
  const ssSegmentation: SegmentationAnswers = {
    filingStatus: "single",
    incomeTypes: ["social-security"],
    lifeEvents: [],
    stateCode: null,
  };

  it("routes to income-social-security section when selected", () => {
    const sections = buildSectionRoute(ssSegmentation);
    const ids = sections.map((s) => s.id);
    expect(ids).toContain("income-social-security");
  });

  it("stores and retrieves SSA-1099 data", () => {
    const state = startInterview(ssSegmentation);
    const data = { netBenefits: "18000", federalWithheld: "2000" };
    const updated = updateSectionData(state, "income-social-security", data);
    const retrieved = getSectionData(updated, "income-social-security");
    expect(retrieved?.netBenefits).toBe("18000");
    expect(retrieved?.federalWithheld).toBe("2000");
  });

  it("emptySocialSecurityData has empty defaults", () => {
    expect(emptySocialSecurityData.netBenefits).toBe("");
    expect(emptySocialSecurityData.federalWithheld).toBe("");
  });
});

// ── Unemployment section data ────────────────────────────────────────────

describe("unemployment section data", () => {
  const unemploymentSegmentation: SegmentationAnswers = {
    filingStatus: "single",
    incomeTypes: ["unemployment"],
    lifeEvents: [],
    stateCode: null,
  };

  it("routes to income-unemployment section when selected", () => {
    const sections = buildSectionRoute(unemploymentSegmentation);
    const ids = sections.map((s) => s.id);
    expect(ids).toContain("income-unemployment");
  });

  it("stores and retrieves 1099-G data", () => {
    const state = startInterview(unemploymentSegmentation);
    const data = { compensation: "12000", federalWithheld: "1200" };
    const updated = updateSectionData(state, "income-unemployment", data);
    const retrieved = getSectionData(updated, "income-unemployment");
    expect(retrieved?.compensation).toBe("12000");
    expect(retrieved?.federalWithheld).toBe("1200");
  });

  it("emptyUnemploymentData has empty defaults", () => {
    expect(emptyUnemploymentData.compensation).toBe("");
    expect(emptyUnemploymentData.federalWithheld).toBe("");
  });
});

// ── Flow state persistence ──────────────────────────────────────────────

describe("flow state persistence", () => {
  const workspaceId = "workspace-alpha";
  const otherWorkspaceId = "workspace-beta";

  function createMockStorage(): Storage {
    const store = new Map<string, string>();
    return {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => { store.set(key, value); },
      removeItem: (key: string) => { store.delete(key); },
      clear: () => { store.clear(); },
      get length() { return store.size; },
      key: () => null,
    };
  }

  it("returns null from empty storage", () => {
    const storage = createMockStorage();
    expect(loadGuidedFlowState(storage, workspaceId)).toBeNull();
  });

  it("saves and loads flow state round-trip", () => {
    const storage = createMockStorage();
    const state = startInterview({
      filingStatus: "mfj",
      incomeTypes: ["w2-wages", "retirement"],
      lifeEvents: [],
      stateCode: "CA",
    });
    const withData = updateSectionData(state, "personal-info", {
      ...emptyPersonalInfo,
      firstName: "Alice",
    });
    saveGuidedFlowState(storage, workspaceId, withData);
    const loaded = loadGuidedFlowState(storage, workspaceId);
    expect(loaded).not.toBeNull();
    expect(loaded!.phase).toBe("interview");
    expect(loaded!.segmentation.filingStatus).toBe("mfj");
    expect(loaded!.segmentation.stateCode).toBe("CA");
    expect((loaded!.sectionData["personal-info"] as { firstName: string })?.firstName).toBe("Alice");
  });

  it("preserves section data across save/load cycles", () => {
    const storage = createMockStorage();
    let state = startInterview({
      filingStatus: "single",
      incomeTypes: ["w2-wages"],
      lifeEvents: [],
      stateCode: null,
    });
    state = updateSectionData(state, "income-w2", {
      entries: [{ ...completeW2Entry, wages: "85000", federalWithheld: "12000" }],
    });
    state = goToNextSection(state);
    saveGuidedFlowState(storage, workspaceId, state);

    const loaded = loadGuidedFlowState(storage, workspaceId)!;
    expect(loaded.completedSections).toContain("personal-info");
    expect(loaded.currentSectionIndex).toBe(1);
    const w2Data = loaded.sectionData["income-w2"] as { entries: Array<{ wages: string }> };
    expect(w2Data.entries[0].wages).toBe("85000");
  });

  it("hydrates legacy saved flows with the default deduction choice", () => {
    const storage = createMockStorage();
    storage.setItem(getGuidedFlowStorageKey(workspaceId), JSON.stringify({
      phase: "interview",
      segmentation: {
        filingStatus: "single",
        incomeTypes: ["w2-wages"],
        lifeEvents: [],
        stateCode: null,
      },
      currentSectionIndex: 2,
      completedSections: ["personal-info", "income-w2"],
      sectionData: {},
    }));

    const loaded = loadGuidedFlowState(storage, workspaceId);
    expect(loaded?.sectionData.deductions).toEqual(emptyDeductionData);
  });

  it("clearGuidedFlowState removes stored state", () => {
    const storage = createMockStorage();
    const state = startInterview({
      filingStatus: "single",
      incomeTypes: [],
      lifeEvents: [],
      stateCode: null,
    });
    saveGuidedFlowState(storage, workspaceId, state);
    expect(loadGuidedFlowState(storage, workspaceId)).not.toBeNull();

    clearGuidedFlowState(storage, workspaceId);
    expect(loadGuidedFlowState(storage, workspaceId)).toBeNull();
  });

  it("returns null for corrupted storage data", () => {
    const storage = createMockStorage();
    storage.setItem(getGuidedFlowStorageKey(workspaceId), "not-valid-json");
    expect(loadGuidedFlowState(storage, workspaceId)).toBeNull();
  });

  it("returns null for storage with invalid shape", () => {
    const storage = createMockStorage();
    storage.setItem(getGuidedFlowStorageKey(workspaceId), JSON.stringify({ phase: "bogus" }));
    expect(loadGuidedFlowState(storage, workspaceId)).toBeNull();
  });

  it("stores flow state separately for each workspace", () => {
    const storage = createMockStorage();
    const firstState = startInterview({
      filingStatus: "single",
      incomeTypes: ["w2-wages"],
      lifeEvents: [],
      stateCode: null,
    });
    const secondState = updateSectionData(startInterview({
      filingStatus: "mfj",
      incomeTypes: ["retirement"],
      lifeEvents: [],
      stateCode: "CA",
    }), "personal-info", {
      ...emptyPersonalInfo,
      firstName: "Jamie",
    });

    saveGuidedFlowState(storage, workspaceId, firstState);
    saveGuidedFlowState(storage, otherWorkspaceId, secondState);

    expect(loadGuidedFlowState(storage, workspaceId)?.segmentation.filingStatus).toBe("single");
    expect(loadGuidedFlowState(storage, otherWorkspaceId)?.segmentation.filingStatus).toBe("mfj");
    expect(loadGuidedFlowState(storage, otherWorkspaceId)?.sectionData["personal-info"]).toMatchObject({
      firstName: "Jamie",
    });
  });

  it("persists other-taxes data across save/load cycle", () => {
    const storage = createMockStorage();
    let state = startInterview({
      filingStatus: "single",
      incomeTypes: ["self-employment"],
      lifeEvents: [],
      stateCode: null,
    });
    state = updateSectionData(state, "other-taxes", {
      ...emptyOtherTaxesData,
      householdEmploymentWages: "3200",
      acknowledgedSETax: true,
    });
    saveGuidedFlowState(storage, workspaceId, state);

    const loaded = loadGuidedFlowState(storage, workspaceId)!;
    const data = loaded.sectionData["other-taxes"] as typeof emptyOtherTaxesData;
    expect(data.householdEmploymentWages).toBe("3200");
    expect(data.acknowledgedSETax).toBe(true);
  });
});

// ── OtherTaxesData defaults ──────────────────────────────────────────────────

describe("emptyOtherTaxesData", () => {
  it("has blank household employment wages", () => {
    expect(emptyOtherTaxesData.householdEmploymentWages).toBe("");
  });

  it("has all acknowledgements set to false", () => {
    expect(emptyOtherTaxesData.acknowledgedSETax).toBe(false);
    expect(emptyOtherTaxesData.acknowledgedAdditionalMedicare).toBe(false);
    expect(emptyOtherTaxesData.acknowledgedNIIT).toBe(false);
  });
});

// ── Other taxes in section data map ─────────────────────────────────────────

describe("other-taxes section data", () => {
  it("stores and retrieves other-taxes data via updateSectionData/getSectionData", () => {
    const state = startInterview({
      filingStatus: "single",
      incomeTypes: ["self-employment"],
      lifeEvents: [],
      stateCode: null,
    });
    const otherTaxes = {
      ...emptyOtherTaxesData,
      householdEmploymentWages: "5000",
      acknowledgedSETax: true,
    };
    const updated = updateSectionData(state, "other-taxes", otherTaxes);
    const retrieved = getSectionData(updated, "other-taxes");
    expect(retrieved).toEqual(otherTaxes);
  });

  it("other-taxes section appears in route for self-employment filers", () => {
    const sections = buildSectionRoute({
      filingStatus: "single",
      incomeTypes: ["self-employment"],
      lifeEvents: [],
      stateCode: null,
    });
    const ids = sections.map((s) => s.id);
    expect(ids).toContain("other-taxes");
  });

  it("other-taxes section does not appear for simple W-2 filers", () => {
    const sections = buildSectionRoute({
      filingStatus: "single",
      incomeTypes: ["w2-wages"],
      lifeEvents: [],
      stateCode: null,
    });
    const ids = sections.map((s) => s.id);
    expect(ids).not.toContain("other-taxes");
  });
});

// ── State return section data ──────────────────────────────────────────────

describe("State return section data", () => {
  it("emptyStateReturnData has empty estimated payments and zero additional withholding", () => {
    expect(emptyStateReturnData.stateEstimatedPayments).toEqual([]);
    expect(emptyStateReturnData.additionalStateWithholding).toBe("");
  });

  it("emptyStateEstimatedPayment has blank date and amount", () => {
    expect(emptyStateEstimatedPayment.date).toBe("");
    expect(emptyStateEstimatedPayment.amount).toBe("");
  });

  it("state-return data can be stored and retrieved via updateSectionData/getSectionData", () => {
    const seg: SegmentationAnswers = {
      filingStatus: "single",
      incomeTypes: ["w2-wages"],
      lifeEvents: [],
      stateCode: "CA",
    };
    let state = startInterview(seg);

    const stateData = {
      stateEstimatedPayments: [
        { date: "2025-04-15", amount: "1500" },
        { date: "2025-06-15", amount: "1500" },
      ],
      additionalStateWithholding: "200",
    };

    state = updateSectionData(state, "state-return", stateData);
    const retrieved = getSectionData(state, "state-return");
    expect(retrieved).toEqual(stateData);
  });

  it("state-return section is included in route when stateCode is set", () => {
    const sections = buildSectionRoute({
      filingStatus: "single",
      incomeTypes: ["w2-wages"],
      lifeEvents: [],
      stateCode: "PA",
    });
    const ids = sections.map((s) => s.id);
    expect(ids).toContain("state-return");
  });

  it("state-return section is not included when stateCode is null", () => {
    const sections = buildSectionRoute({
      filingStatus: "single",
      incomeTypes: ["w2-wages"],
      lifeEvents: [],
      stateCode: null,
    });
    const ids = sections.map((s) => s.id);
    expect(ids).not.toContain("state-return");
  });

  it("final-review is the last section in the route when state-return is included", () => {
    const sections = buildSectionRoute({
      filingStatus: "single",
      incomeTypes: ["w2-wages"],
      lifeEvents: [],
      stateCode: "CA",
    });
    const ids = sections.map((s) => s.id);
    expect(ids[ids.length - 2]).toBe("state-return");
    expect(ids[ids.length - 1]).toBe("final-review");
  });

  it("progress includes state-return section in count", () => {
    const seg: SegmentationAnswers = {
      filingStatus: "single",
      incomeTypes: [],
      lifeEvents: [],
      stateCode: "WA",
    };
    const stateWithState = startInterview(seg);
    const progressWithState = computeFlowProgress(stateWithState);

    const segNoState: SegmentationAnswers = {
      filingStatus: "single",
      incomeTypes: [],
      lifeEvents: [],
      stateCode: null,
    };
    const stateWithout = startInterview(segNoState);
    const progressWithout = computeFlowProgress(stateWithout);

    expect(progressWithState.totalSections).toBe(progressWithout.totalSections + 1);
  });
});

// ── Guided → workspace sync integration ──────────────────────────────────

describe("syncGuidedFlowToWorkspace", () => {
  it("injects synthetic documents into workspace", () => {
    const workspace = createWorkspaceRecord("test-sync");
    let state = startInterview({
      filingStatus: "single",
      incomeTypes: ["w2-wages"],
      lifeEvents: [],
      stateCode: null,
    });
    state = updateSectionData(state, "income-w2", {
      entries: [{ ...completeW2Entry, wages: "50000", federalWithheld: "5000" }],
    });
    const docs = buildGuidedSyntheticDocuments(state);
    const answers = buildGuidedFactAnswers(state);
    const synced = syncGuidedFlowToWorkspace(workspace, docs, answers);

    expect(synced.documents.length).toBeGreaterThan(0);
    expect(synced.documents.some((d) => d.id === "guided:w2")).toBe(true);
  });

  it("auto-answers seeded facts from guided data", () => {
    const workspace = createWorkspaceRecord("test-sync-facts");
    let state = startInterview({
      filingStatus: "single",
      incomeTypes: ["w2-wages"],
      lifeEvents: [],
      stateCode: null,
    });
    state = updateSectionData(state, "income-w2", {
      entries: [{ ...completeW2Entry, wages: "50000", federalWithheld: "5000" }],
    });
    const docs = buildGuidedSyntheticDocuments(state);
    const answers = buildGuidedFactAnswers(state);
    const synced = syncGuidedFlowToWorkspace(workspace, docs, answers);

    const wagesFact = synced.seededReturn.facts.find((f) => f.id === "wages");
    expect(wagesFact).toBeTruthy();
    expect(wagesFact!.status).toBe("answered");
    expect(wagesFact!.answerText).toContain("$50,000");

    const withholdingFact = synced.seededReturn.facts.find((f) => f.id === "withholding");
    expect(withholdingFact).toBeTruthy();
    expect(withholdingFact!.status).toBe("answered");
  });

  it("keeps skipped guided sections as workspace blockers after sync", () => {
    const workspace = createWorkspaceRecord("test-sync-guided-follow-up");
    const state: GuidedFlowState = {
      phase: "complete",
      segmentation: {
        filingStatus: "single",
        incomeTypes: ["w2-wages"],
        lifeEvents: [],
        stateCode: null,
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
          otherItemized: "",
        },
        "income-w2": {
          entries: [{ ...completeW2Entry, employerName: "Acme", wages: "50000", federalWithheld: "5000" }],
        },
      },
    };
    const docs = buildGuidedSyntheticDocuments(state);
    const answers = buildGuidedFactAnswers(state);
    const synced = syncGuidedFlowToWorkspace(workspace, docs, answers, state);

    expect(synced.guidedCompletion).toEqual({
      completedSectionCount: 5,
      totalSectionCount: 7,
      skippedSectionCount: 1,
      needsReviewSectionCount: 0,
    });
    // One skipped personal section plus one unvisited final review remain pending.
    expect(synced.summary.interviewQuestionsRemaining).toBe(2);
    expect(synced.returnSummary.status).not.toBe("ready-to-recompute");
    expect(synced.returnSummary.blockers).toContainEqual({
      id: "guided:incomplete-facts",
      message: "2 guided sections still need completion or review.",
      relatedFactIds: [],
      sourceDocumentIds: [],
    });
    expect(synced.returnSummary.blockers.some(blocker => blocker.id === "guided:missing-tax-year")).toBe(true);
    expect(synced.checklist.find((item) => item.id === "interview")?.status).toBe("needs-input");
    expect(synced.checklist.find((item) => item.id === "review")?.status).toBe("blocked");
  });

  it("preserves user-uploaded documents when syncing", () => {
    const workspace = createWorkspaceRecord("test-preserve");
    // Simulate a user-uploaded document already in workspace
    const workspaceWithDoc = {
      ...workspace,
      documents: [
        ...workspace.documents,
        {
          id: "user:w2:some-file.pdf:1234",
          name: "some-file.pdf",
          size: 1234,
          uploadedAt: new Date().toISOString(),
          kind: "w2" as const,
          coverage: "supported" as const,
          label: "W-2 user upload",
          notes: "Uploaded by user",
          matchedFixtureId: null,
          seededFactIds: ["wages" as const, "withholding" as const],
        },
      ],
    };

    let state = startInterview({
      filingStatus: "single",
      incomeTypes: ["self-employment"],
      lifeEvents: [],
      stateCode: null,
    });
    state = updateSectionData(state, "income-self-employment", {
      necEntries: [{ ...emptyNecEntry, nonemployeeCompensation: "30000" }],
      expenses: emptyScheduleCExpenses,
    });
    const docs = buildGuidedSyntheticDocuments(state);
    const answers = buildGuidedFactAnswers(state);
    const synced = syncGuidedFlowToWorkspace(workspaceWithDoc, docs, answers);

    // Should have both the user-uploaded W-2 and the guided 1099-NEC
    expect(synced.documents.some((d) => d.id === "user:w2:some-file.pdf:1234")).toBe(true);
    expect(synced.documents.some((d) => d.id === "guided:1099-nec")).toBe(true);
  });

  it("replaces prior guided documents on re-sync", () => {
    const workspace = createWorkspaceRecord("test-resync");
    let state = startInterview({
      filingStatus: "single",
      incomeTypes: ["w2-wages"],
      lifeEvents: [],
      stateCode: null,
    });
    state = updateSectionData(state, "income-w2", {
      entries: [{ ...completeW2Entry, wages: "50000" }],
    });

    // First sync
    const docs1 = buildGuidedSyntheticDocuments(state);
    const answers1 = buildGuidedFactAnswers(state);
    const synced1 = syncGuidedFlowToWorkspace(workspace, docs1, answers1);
    expect(synced1.documents.filter((d) => d.id.startsWith("guided:")).length).toBe(1);

    // Second sync with updated data (add investments)
    state = updateSectionData(state, "income-investments", {
      interestEntries: [{ ...emptyInterestEntry, interestIncome: "1000" }],
      dividendEntries: [emptyDividendEntry],
      brokerageEntries: [emptyBrokerageEntry],
    });
    const docs2 = buildGuidedSyntheticDocuments(state);
    const answers2 = buildGuidedFactAnswers(state);
    const synced2 = syncGuidedFlowToWorkspace(synced1, docs2, answers2);

    // Should have guided:w2 and guided:1099-int (no duplicates)
    const guidedDocs = synced2.documents.filter((d) => d.id.startsWith("guided:"));
    expect(guidedDocs.length).toBe(2);
    expect(guidedDocs.map((d) => d.id).sort()).toEqual(["guided:1099-int", "guided:w2"]);
  });

  it("computes engine preview from synced workspace", () => {
    const workspace = createWorkspaceRecord("test-preview");
    let state = startInterview({
      filingStatus: "single",
      incomeTypes: ["w2-wages"],
      lifeEvents: [],
      stateCode: null,
    });
    state = updateSectionData(state, "income-w2", {
      entries: [{ ...completeW2Entry, wages: "75000", federalWithheld: "10000" }],
    });
    const docs = buildGuidedSyntheticDocuments(state);
    const answers = buildGuidedFactAnswers(state);
    const synced = syncGuidedFlowToWorkspace(workspace, docs, answers);

    // The workspace should have an engine preview with answered facts
    const answeredFacts = synced.seededReturn.facts.filter((f) => f.status === "answered");
    expect(answeredFacts.length).toBeGreaterThan(0);

    // Interview queue should be smaller (some questions now answered)
    expect(synced.seededReturn.interviewQueue.length).toBeLessThan(
      synced.seededReturn.facts.length
    );
  });

  it("handles empty guided state gracefully (no-op sync)", () => {
    const workspace = createWorkspaceRecord("test-empty-sync");
    const state = startInterview({
      filingStatus: "single",
      incomeTypes: [],
      lifeEvents: [],
      stateCode: null,
    });
    const docs = buildGuidedSyntheticDocuments(state);
    const answers = buildGuidedFactAnswers(state);
    const synced = syncGuidedFlowToWorkspace(workspace, docs, answers);

    // No synthetic documents, no answered facts
    expect(synced.documents.length).toBe(0);
    expect(synced.seededReturn.facts.filter((f) => f.status === "answered").length).toBe(0);
  });
});

// ── Segmentation step tracking ──────────────────────────────────────────────

describe("segmentationSteps", () => {
  it("has exactly four steps in the correct order", () => {
    expect(segmentationSteps).toHaveLength(4);
    expect(segmentationSteps.map((s) => s.id)).toEqual([
      "filing-status",
      "income-types",
      "life-events",
      "state-residence",
    ]);
  });

  it("each step has a human-readable label", () => {
    for (const step of segmentationSteps) {
      expect(step.label.length).toBeGreaterThan(0);
    }
  });
});

describe("getNextSegmentationStep", () => {
  it("returns filing-status when no filing status is selected", () => {
    expect(getNextSegmentationStep(emptySegmentation)).toBe("filing-status");
  });

  it("returns null once filing status is selected (linear walk complete)", () => {
    const answers: SegmentationAnswers = {
      ...emptySegmentation,
      filingStatus: "single",
    };
    expect(getNextSegmentationStep(answers)).toBeNull();
  });

  it("returns null for fully populated segmentation", () => {
    const answers: SegmentationAnswers = {
      filingStatus: "mfj",
      incomeTypes: ["w2-wages", "investments"],
      lifeEvents: ["had-baby"],
      stateCode: "CA",
    };
    expect(getNextSegmentationStep(answers)).toBeNull();
  });
});

// ── End-to-end segmentation → interview flow ─────────────────────────────

describe("segmentation to interview transition", () => {
  it("startInterview preserves all segmentation answers", () => {
    const answers: SegmentationAnswers = {
      filingStatus: "hoh",
      incomeTypes: ["w2-wages", "self-employment"],
      lifeEvents: ["student-loans", "hsa-contributions"],
      stateCode: "PA",
    };
    const state = startInterview(answers);

    expect(state.phase).toBe("interview");
    expect(state.segmentation).toEqual(answers);
    expect(state.currentSectionIndex).toBe(0);
    expect(state.completedSections).toEqual([]);
  });

  it("routes sections correctly from segmentation answers", () => {
    const answers: SegmentationAnswers = {
      filingStatus: "single",
      incomeTypes: ["w2-wages"],
      lifeEvents: [],
      stateCode: null,
    };
    const state = startInterview(answers);
    const sections = buildSectionRoute(state.segmentation);

    // Simple W-2 filer: personal-info, income-w2, deductions, credits, payments, review
    const ids = sections.map((s) => s.id);
    expect(ids).toContain("personal-info");
    expect(ids).toContain("income-w2");
    expect(ids).toContain("deductions");
    expect(ids).toContain("review");
    expect(ids).not.toContain("income-self-employment");
    expect(ids).not.toContain("state-return");
  });

  it("navigating through all sections reaches complete phase", () => {
    const answers: SegmentationAnswers = {
      filingStatus: "single",
      incomeTypes: ["w2-wages"],
      lifeEvents: [],
      stateCode: null,
    };
    let state = startInterview(answers);
    const sections = buildSectionRoute(state.segmentation);

    // Advance through every section
    for (let i = 0; i < sections.length; i++) {
      state = goToNextSection(state);
    }

    expect(state.phase).toBe("complete");
    expect(state.completedSections).toHaveLength(sections.length);
  });
});

// ── Section validation ────────────────────────────────────────────────────

describe("validateSection", () => {
  it("returns empty for personal-info with no data", () => {
    const state = startInterview({ filingStatus: "single", incomeTypes: ["w2-wages"], lifeEvents: [], stateCode: null });
    const result = validateSection(state, "personal-info");
    expect(result.status).toBe("empty");
    expect(result.message).toContain("personal info");
  });

  it("returns partial for personal-info with partial data", () => {
    let state = startInterview({ filingStatus: "single", incomeTypes: ["w2-wages"], lifeEvents: [], stateCode: null });
    state = updateSectionData(state, "personal-info", {
      ...emptyPersonalInfo,
      firstName: "Jane",
    });
    const result = validateSection(state, "personal-info");
    expect(result.status).toBe("partial");
    expect(result.fieldErrors).toHaveProperty("lastName");
  });

  it("returns complete for personal-info with actual identity and residency facts", () => {
    let state = startInterview({ filingStatus: "single", incomeTypes: ["w2-wages"], lifeEvents: [], stateCode: null });
    state = updateSectionData(state, "personal-info", {
      ...completePersonalInfo,
      firstName: "Jane",
      lastName: "Doe",
    });
    const result = validateSection(state, "personal-info");
    expect(result.status).toBe("complete");
  });

  it("returns empty for W-2 section with no data", () => {
    const state = startInterview({ filingStatus: "single", incomeTypes: ["w2-wages"], lifeEvents: [], stateCode: null });
    const result = validateSection(state, "income-w2");
    expect(result.status).toBe("empty");
  });

  it("returns partial for W-2 with employer name but no wages", () => {
    let state = startInterview({ filingStatus: "single", incomeTypes: ["w2-wages"], lifeEvents: [], stateCode: null });
    state = updateSectionData(state, "income-w2", {
      entries: [{ ...completeW2Entry, employerName: "Acme", wages: "" }],
    });
    const result = validateSection(state, "income-w2");
    expect(result.status).toBe("partial");
    expect(Object.keys(result.fieldErrors).length).toBeGreaterThan(0);
  });

  it("returns complete for W-2 with complete actual source facts", () => {
    let state = startInterview({ filingStatus: "single", incomeTypes: ["w2-wages"], lifeEvents: [], stateCode: null });
    state = updateSectionData(state, "income-w2", {
      entries: [{ ...completeW2Entry, wages: "50000", employerName: "Acme" }],
    });
    const result = validateSection(state, "income-w2");
    expect(result.status).toBe("complete");
  });

  it("returns empty for self-employment with no data", () => {
    const state = startInterview({ filingStatus: "single", incomeTypes: ["self-employment"], lifeEvents: [], stateCode: null });
    const result = validateSection(state, "income-self-employment");
    expect(result.status).toBe("empty");
  });

  it("returns complete for self-employment with NEC data", () => {
    let state = startInterview({ filingStatus: "single", incomeTypes: ["self-employment"], lifeEvents: [], stateCode: null });
    state = updateSectionData(state, "income-self-employment", {
      ...completeBusinessSection,
      necEntries: [{ ...completeNecSource, nonemployeeCompensation: "5000" }],
      manualGrossReceipts: "0",
      expenses: completeBusinessExpenses,
    });
    const result = validateSection(state, "income-self-employment");
    expect(result.status).toBe("complete");
  });

  it("returns complete for self-employment with manual gross receipts and no 1099-NEC", () => {
    let state = startInterview({ filingStatus: "single", incomeTypes: ["self-employment"], lifeEvents: [], stateCode: null });
    state = updateSectionData(state, "income-self-employment", {
      ...completeBusinessSection,
      necEntries: [emptyNecEntry],
      manualGrossReceipts: "7200",
      expenses: completeBusinessExpenses,
    });
    const result = validateSection(state, "income-self-employment");
    expect(result.status).toBe("complete");
  });

  it("returns empty for investment section with no data", () => {
    const state = startInterview({ filingStatus: "single", incomeTypes: ["investments"], lifeEvents: [], stateCode: null });
    const result = validateSection(state, "income-investments");
    expect(result.status).toBe("empty");
  });

  it("returns complete for investment section with interest income", () => {
    let state = startInterview({ filingStatus: "single", incomeTypes: ["investments"], lifeEvents: [], stateCode: null });
    state = updateSectionData(state, "income-investments", {
      interestEntries: [{ ...completeInterestSource, interestIncome: "500" }],
      dividendEntries: [emptyDividendEntry],
      brokerageEntries: [emptyBrokerageEntry],
    });
    const result = validateSection(state, "income-investments");
    expect(result.status).toBe("complete");
  });

  it("returns empty for rental section with no data", () => {
    const state = startInterview({ filingStatus: "single", incomeTypes: ["rental"], lifeEvents: [], stateCode: null });
    const result = validateSection(state, "income-rental");
    expect(result.status).toBe("empty");
  });

  it("returns empty for retirement section with no data", () => {
    const state = startInterview({ filingStatus: "single", incomeTypes: ["retirement"], lifeEvents: [], stateCode: null });
    const result = validateSection(state, "income-retirement");
    expect(result.status).toBe("empty");
  });

  it("returns partial for retirement section with only taxable amount", () => {
    let state = startInterview({ filingStatus: "single", incomeTypes: ["retirement"], lifeEvents: [], stateCode: null });
    state = updateSectionData(state, "income-retirement", {
      entries: [{ ...emptyRetirementEntry, taxableAmount: "15000" }],
    });
    const result = validateSection(state, "income-retirement");
    expect(result.status).toBe("partial");
    expect(result.allowSkip).toBe(false);
  });

  it("returns empty for social security with no data", () => {
    const state = startInterview({ filingStatus: "single", incomeTypes: ["social-security"], lifeEvents: [], stateCode: null });
    const result = validateSection(state, "income-social-security");
    expect(result.status).toBe("empty");
  });

  it("returns complete for social security with actual source and treatment facts", () => {
    let state = startInterview({ filingStatus: "single", incomeTypes: ["social-security"], lifeEvents: [], stateCode: null });
    state.sectionData["personal-info"] = completePersonalInfo;
    state = updateSectionData(state, "income-social-security", {
      ...emptySocialSecurityData, ...completeSocialSecurityTreatment, entries: [{ ...completeSocialSecuritySource, benefitsPaid: "18000", netBenefits: "18000" }],
    });
    const result = validateSection(state, "income-social-security");
    expect(result.status).toBe("complete");
  });

  it("returns empty for unemployment with no data", () => {
    const state = startInterview({ filingStatus: "single", incomeTypes: ["unemployment"], lifeEvents: [], stateCode: null });
    const result = validateSection(state, "income-unemployment");
    expect(result.status).toBe("empty");
  });

  it("returns complete for unemployment with actual source and program facts", () => {
    let state = startInterview({ filingStatus: "single", incomeTypes: ["unemployment"], lifeEvents: [], stateCode: null });
    state.sectionData["personal-info"] = completePersonalInfo;
    state = updateSectionData(state, "income-unemployment", {
      ...emptyUnemploymentData,
      compensation: "12000", entries: [{ ...completeUnemploymentSource, compensation: "12000" }],
    });
    const result = validateSection(state, "income-unemployment");
    expect(result.status).toBe("complete");
  });

  it("returns complete for deductions with data (standard method)", () => {
    let state = startInterview({ filingStatus: "single", incomeTypes: ["w2-wages"], lifeEvents: [], stateCode: null });
    state = updateSectionData(state, "deductions", {
      ...emptyDeductionData,
      method: "standard",
    });
    const result = validateSection(state, "deductions");
    expect(result.status).toBe("complete");
  });

  it("returns complete for untouched deductions because standard is the default choice", () => {
    const state = startInterview({ filingStatus: "single", incomeTypes: ["w2-wages"], lifeEvents: [], stateCode: null });
    const result = validateSection(state, "deductions");
    expect(result.status).toBe("complete");
  });

  it("returns empty for adjustments with no values", () => {
    let state = startInterview({ filingStatus: "single", incomeTypes: ["self-employment"], lifeEvents: [], stateCode: null });
    state = updateSectionData(state, "adjustments", emptyAdjustmentData);
    const result = validateSection(state, "adjustments");
    expect(result.status).toBe("empty");
  });

  it("returns complete for adjustments with actual student-loan sources", () => {
    let state = startInterview({ filingStatus: "single", incomeTypes: ["self-employment"], lifeEvents: ["student-loans"], stateCode: null }, 2025);
    state = updateSectionData(state, "adjustments", {
      ...emptyAdjustmentData,
      studentLoanInterest: "2500", studentLoanFacts: syntheticStudentLoanFacts(2025, "2500"),
    });
    const result = validateSection(state, "adjustments");
    expect(result.status).toBe("complete");
  });

  it("returns empty for payments with no data", () => {
    let state = startInterview({ filingStatus: "single", incomeTypes: ["w2-wages"], lifeEvents: [], stateCode: null });
    state = updateSectionData(state, "payments", emptyPaymentData);
    const result = validateSection(state, "payments");
    expect(result.status).toBe("empty");
  });

  it("returns complete for credits (always optional)", () => {
    const state = startInterview({ filingStatus: "single", incomeTypes: ["w2-wages"], lifeEvents: [], stateCode: null });
    const result = validateSection(state, "credits");
    expect(result.status).toBe("complete");
  });

  it("returns complete for review (always valid)", () => {
    const state = startInterview({ filingStatus: "single", incomeTypes: ["w2-wages"], lifeEvents: [], stateCode: null });
    const result = validateSection(state, "review");
    expect(result.status).toBe("complete");
  });

  it("returns complete for other-taxes (informational)", () => {
    const state = startInterview({ filingStatus: "single", incomeTypes: ["self-employment"], lifeEvents: [], stateCode: null });
    const result = validateSection(state, "other-taxes");
    expect(result.status).toBe("complete");
  });

  it("returns complete for state-return (optional)", () => {
    const state = startInterview({ filingStatus: "single", incomeTypes: ["w2-wages"], lifeEvents: [], stateCode: "WA" });
    const result = validateSection(state, "state-return");
    expect(result.status).toBe("complete");
  });

  it("validates dependent name presence", () => {
    let state = startInterview({ filingStatus: "single", incomeTypes: ["w2-wages"], lifeEvents: [], stateCode: null });
    state = updateSectionData(state, "personal-info", {
      ...emptyPersonalInfo,
      firstName: "Jane",
      lastName: "Doe",
      dependentCount: "1",
      dependents: [{ ...emptyDependentEntry }],
    });
    const result = validateSection(state, "personal-info");
    expect(result.status).toBe("partial");
    expect(result.fieldErrors["dependent-0-name"]).toBeDefined();
  });
});

describe("shouldPromptBeforeAdvance", () => {
  it("returns null when section is complete", () => {
    let state = startInterview({ filingStatus: "single", incomeTypes: ["w2-wages"], lifeEvents: [], stateCode: null });
    state = updateSectionData(state, "personal-info", {
      ...completePersonalInfo,
      firstName: "Jane",
      lastName: "Doe",
    });
    const result = shouldPromptBeforeAdvance(state);
    expect(result).toBeNull();
  });

  it("returns validation result when section is empty", () => {
    const state = startInterview({ filingStatus: "single", incomeTypes: ["w2-wages"], lifeEvents: [], stateCode: null });
    // At personal-info section with no data
    const result = shouldPromptBeforeAdvance(state);
    expect(result).not.toBeNull();
    expect(result?.status).toBe("empty");
  });

  it("returns validation result when section is partial", () => {
    let state = startInterview({ filingStatus: "single", incomeTypes: ["w2-wages"], lifeEvents: [], stateCode: null });
    state = updateSectionData(state, "personal-info", {
      ...emptyPersonalInfo,
      firstName: "Jane",
      // Missing last name
    });
    const result = shouldPromptBeforeAdvance(state);
    expect(result).not.toBeNull();
    expect(result?.status).toBe("partial");
  });

  it.each([
    { sourceLabel: "2026 Form W-2 (official info-copy PDF)", sourceType: undefined },
    { sourceLabel: "2025 Form W-2", sourceType: "official-fixture" },
  ])("requires confirming sample W-2 values before advancing: $sourceLabel", (source) => {
    let state = startInterview({ filingStatus: "single", incomeTypes: ["w2-wages"], lifeEvents: [], stateCode: null });
    state = updateSectionData(state, "personal-info", {
      ...emptyPersonalInfo,
      firstName: "Jane",
      lastName: "Doe",
    });
    state = goToNextSection(state);
    state = updateSectionData(state, "income-w2", {
      entries: [
        {
          ...completeW2Entry,
          employerName: "Official fixture employer",
          employerEin: "12-3456789",
          wages: "52000",
          federalWithheld: "5000",
          aiSuggestedFields: {
            employerName: {
              ...source,
              status: "pending-confirmation",
            },
            employerEin: {
              ...source,
              status: "pending-confirmation",
            },
            wages: {
              ...source,
              status: "pending-confirmation",
            },
            federalWithheld: {
              ...source,
              status: "pending-confirmation",
            },
          },
        },
      ],
    });

    const result = shouldPromptBeforeAdvance(state);

    expect(result).not.toBeNull();
    expect(result?.status).toBe("partial");
    expect(result?.allowSkip).toBe(false);
    expect(result?.message).toMatch(/confirm the highlighted sample values/i);
    expect(result?.fieldErrors).toMatchObject({
      "w2-0-employerName": "W-2 #1: confirm Employer name",
      "w2-0-employerEin": "W-2 #1: confirm Employer EIN",
      "w2-0-wages": "W-2 #1: confirm Box 1 wages",
      "w2-0-federalWithheld": "W-2 #1: confirm Box 2 federal tax withheld",
    });
  });

  it("does not prompt on untouched deductions because the standard choice is already selected", () => {
    let state = startInterview({ filingStatus: "single", incomeTypes: ["w2-wages"], lifeEvents: [], stateCode: null });
    state = updateSectionData(state, "personal-info", {
      ...emptyPersonalInfo,
      firstName: "Jane",
      lastName: "Doe",
    });
    state = goToNextSection(state);
    state = updateSectionData(state, "income-w2", {
      entries: [{ ...completeW2Entry, employerName: "Acme", wages: "50000" }],
    });
    state = goToNextSection(state);

    expect(shouldPromptBeforeAdvance(state)).toBeNull();
  });
});

// ── Standard deduction lookup ───────────────────────────────────────────────

describe("getStandardDeductionAmount", () => {
  it("returns 15750 for single filer", () => {
    expect(getStandardDeductionAmount("single", 2025)).toBe(15750);
  });

  it("returns 31500 for married filing jointly", () => {
    expect(getStandardDeductionAmount("mfj", 2025)).toBe(31500);
  });

  it("returns 15750 for married filing separately", () => {
    expect(getStandardDeductionAmount("mfs", 2025)).toBe(15750);
  });

  it("returns 23625 for head of household", () => {
    expect(getStandardDeductionAmount("hoh", 2025)).toBe(23625);
  });

  it("returns 31500 for qualifying surviving spouse", () => {
    expect(getStandardDeductionAmount("qss", 2025)).toBe(31500);
  });

  it("returns 0 for null filing status", () => {
    expect(getStandardDeductionAmount(null, 2025)).toBe(0);
  });
});

// ── Deduction comparison ────────────────────────────────────────────────────

describe("computeDeductionComparison", () => {
  it("recommends standard when itemized total is below standard deduction", () => {
    const result = computeDeductionComparison("single", {
      ...emptyDeductionData,
      method: "itemized",
      mortgageInterest: "8000",
      charitableContributions: "2000",
    }, 2025);
    expect(result.standardAmount).toBe(15750);
    expect(result.itemizedTotal).toBe("10000");
    expect(result.recommendation).toBe("standard");
    expect(result.savings).toBe("5750");
  });

  it("recommends itemized when itemized total exceeds standard deduction", () => {
    const result = computeDeductionComparison("single", {
      ...emptyDeductionData,
      method: "itemized",
      mortgageInterest: "10000",
      stateLocalTaxes: "5000",
      charitableContributions: "3000",
    }, 2025);
    expect(result.standardAmount).toBe(15750);
    expect(result.itemizedTotal).toBe("18000");
    expect(result.recommendation).toBe("itemized");
    expect(result.savings).toBe("2250");
  });

  it("returns equal when totals match exactly", () => {
    const result = computeDeductionComparison("single", {
      ...emptyDeductionData,
      method: "itemized",
      mortgageInterest: "10000",
      charitableContributions: "5000",
    }, 2025);
    expect(result.standardAmount).toBe(15750);
    expect(result.itemizedTotal).toBe("15000");
    expect(result.recommendation).toBe("standard");
    expect(result.savings).toBe("750");
  });

  it("uses MFJ standard deduction amount for joint filers", () => {
    const result = computeDeductionComparison("mfj", {
      ...emptyDeductionData,
      method: "itemized",
      mortgageInterest: "20000",
    }, 2025);
    expect(result.standardAmount).toBe(31500);
    expect(result.itemizedTotal).toBe("20000");
    expect(result.recommendation).toBe("standard");
    expect(result.savings).toBe("11500");
  });

  it("handles undefined deduction data gracefully", () => {
    const result = computeDeductionComparison("single", undefined, 2025);
    expect(result.standardAmount).toBe(15750);
    expect(result.itemizedTotal).toBe("0");
    expect(result.recommendation).toBe("standard");
    expect(result.savings).toBe("15750");
  });

  it("handles null filing status", () => {
    const result = computeDeductionComparison(null, {
      ...emptyDeductionData,
      method: "itemized",
      mortgageInterest: "10000",
    }, 2025);
    expect(result.standardAmount).toBe(0);
    expect(result.itemizedTotal).toBe("10000");
    expect(result.recommendation).toBe("itemized");
    expect(result.savings).toBe("10000");
  });

  it("rejects malformed nonempty monetary inputs", () => {
    expect(() => computeDeductionComparison("single", { ...emptyDeductionData, method: "itemized", mortgageInterest: "abc" }, 2025)).toThrow();
  });

  it("handles comma-formatted currency values", () => {
    const result = computeDeductionComparison("single", {
      ...emptyDeductionData,
      method: "itemized",
      mortgageInterest: "12,500",
      charitableContributions: "3,000",
    }, 2025);
    expect(result.itemizedTotal).toBe("15500");
  });

  it("sums all seven itemized deduction fields", () => {
    const result = computeDeductionComparison("single", {
      method: "itemized",
      medicalExpenses: "1000",
      stateLocalTaxes: "2000",
      realEstateTaxes: "3000",
      mortgageInterest: "4000",
      charitableContributions: "5000",
      casualtyLosses: "1000",
      otherItemized: "1000",
    }, 2025);
    expect(result.itemizedTotal).toBe("17000");
    expect(result.recommendation).toBe("itemized");
    expect(result.savings).toBe("1250");
  });
});
