import { describe, expect, it } from "vitest";
import { getInterviewQuestionUiHint } from "../../../apps/web/src/lib/interview-question-ui";

describe("interview question UI hints", () => {
  it("explains the capital gain distributions question in plain English", () => {
    const hint = getInterviewQuestionUiHint("capital-gain-distributions");

    expect(hint.helperText).toContain("plain English");
    expect(hint.helperText).toContain("Do not enter 0");
    expect(hint.placeholder).toContain("No basis review is needed");
    expect(hint.quickAnswers.map((answer) => answer.label)).toEqual([
      "No basis review needed",
      "Basis review needed",
    ]);
  });

  it("provides W-2 specific confirmation shortcuts", () => {
    const hint = getInterviewQuestionUiHint("wages");

    expect(hint.placeholder).toContain("Every W-2 is final");
    expect(hint.quickAnswers[0]?.value).toContain("no corrected copy is expected");
  });

  it("falls back to generic guidance for other question types", () => {
    const hint = getInterviewQuestionUiHint("government-payments-review");

    expect(hint.helperText).toContain("plain English");
    expect(hint.quickAnswers).toHaveLength(2);
  });
});
