import { describe, expect, it } from "vitest";
import {
  emptyBrokerageEntry,
  emptyDividendEntry,
  emptyInterestEntry,
  emptyW2Entry,
  getVisitedSectionStatus,
  shouldPromptBeforeAdvance,
  startInterview,
  summarizeFlowCompletion,
  validateSection,
  type GuidedFlowState,
} from "../../../apps/web/src/lib/guided-interview-flow";

function buildInterviewState(overrides: Partial<GuidedFlowState> = {}): GuidedFlowState {
  return {
    ...startInterview({
      filingStatus: "single",
      incomeTypes: ["investments", "w2-wages"],
      lifeEvents: [],
      stateCode: null,
    }),
    ...overrides,
  };
}

describe("guided interview flow skip handling", () => {
  it("treats an empty completed section as complete instead of skipped", () => {
    const state = buildInterviewState({
      completedSections: ["personal-info", "income-investments"],
      sectionData: {},
    });

    expect(getVisitedSectionStatus(state, "income-investments")).toBe("complete");

    const completion = summarizeFlowCompletion(state);
    expect(completion.skippedSections).toBe(0);
    expect(completion.needsReviewSections).toBe(0);
  });

  it("flags started but incomplete investment entries as needing review", () => {
    const state = buildInterviewState({
      completedSections: ["personal-info", "income-investments"],
      sectionData: {
        "income-investments": {
          interestEntries: [
            { ...emptyInterestEntry, payer: "Fidelity" }
          ],
          dividendEntries: [{ ...emptyDividendEntry }],
          brokerageEntries: [{ ...emptyBrokerageEntry }],
        }
      },
    });

    expect(validateSection(state, "income-investments")).toMatchObject({
      status: "partial",
      allowSkip: true,
    });
    expect(getVisitedSectionStatus(state, "income-investments")).toBe("needs-review");

    const completion = summarizeFlowCompletion(state);
    expect(completion.needsReviewSections).toBe(1);
  });

  it("lets W-2 suggestion confirmations be skipped so the workflow can continue", () => {
    const state = buildInterviewState({
      currentSectionIndex: 2,
      sectionData: {
        "income-w2": {
          entries: [
            {
              ...emptyW2Entry,
              wages: "1000",
              aiSuggestedFields: {
                wages: {
                  sourceLabel: "Uploaded W-2",
                  status: "pending-confirmation"
                }
              }
            }
          ]
        }
      },
    });

    expect(shouldPromptBeforeAdvance(state)).toMatchObject({
      status: "partial",
      allowSkip: true,
    });
  });
});
