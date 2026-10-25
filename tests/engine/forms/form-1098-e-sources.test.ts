// Spec: spec/federal/form-1098-e.yaml, actual Box2 interpretation.
import { expect, it } from "vitest";
import { Form1098ESchema } from "@/models/inputs";
import { calculateForm1098E } from "@/engine/forms/form-1098-e";

it("preserves actual Box2 status and never reinterprets the legacy flag", () => {
  const base = { lender: "Actual source lender", studentLoanInterestReceived: "9007199254740993.01" };
  for (const legacy of [undefined, false, true]) {
    const source = Form1098ESchema.parse({ ...base, includesOriginationFeesOrCapitalizedInterest: legacy });
    expect(source.box2ExcludesOriginationFeesOrCapitalizedInterest).toBeUndefined();
    expect(source.includesOriginationFeesOrCapitalizedInterest).toBe(legacy);
    expect(calculateForm1098E([source]).lines[0]?.formula).toContain("Box 2 status unknown");
  }
  for (const actual of [false, true]) {
    const source = Form1098ESchema.parse({ ...base, sourceId: "statement-1", taxYear: 2026, borrowerId: "actual-borrower", accountHolder: "spouse", box2ExcludesOriginationFeesOrCapitalizedInterest: actual, includesOriginationFeesOrCapitalizedInterest: !actual });
    expect(source).toMatchObject({ sourceId: "statement-1", taxYear: 2026, borrowerId: "actual-borrower", accountHolder: "spouse", box2ExcludesOriginationFeesOrCapitalizedInterest: actual });
    const result = calculateForm1098E([source]);
    expect(result.totalStudentLoanInterest.toString()).toBe(base.studentLoanInterestReceived);
    expect(result.lines[0]?.formula).toContain(actual ? "does not include" : "Box 2 unchecked");
    expect(result.lines[0]?.formula).not.toContain("Box 1 (includes");
  }
});
