// Spec: spec/federal/guided-tip-income.yaml.
import { expect, it } from "vitest";
import { buildTipIncomeInputs, tipIncomeW2Sources } from "@/lib/guided-tip-income-facts";
import { calculateForm4137 } from "@/engine/forms/form-4137";
import { getConstants } from "@/models/constants";
import { emptyW2Entry } from "@/lib/guided-interview-flow";
import { actualTipIncome, actualTipW2 } from "./guided-tip-income-fixtures";
it("preserves actual monthly tip sources and separate noncash income", () => {
  const input = buildTipIncomeInputs([actualTipIncome()], "single", 2025, [actualTipW2]);
  expect(input?.primary?.sourceFacts?.noncashTipsNotIncludedInWages).toBe("25.5");
  expect(input?.primary?.sourceFacts?.employers?.[0]?.smallTipMonths).toEqual([{ month: 6, totalCashAndChargeTips: "18", tipsReportedToEmployer: "0" }]);
  expect(input?.primary).not.toHaveProperty("unreportedTipIncome");
  const result = calculateForm4137(input!.primary!, getConstants(2025), { sourcePayroll: { accountHolder: "primary", w2s: tipIncomeW2Sources([actualTipW2]) } });
  expect(result.unreportedTipIncome.toFixed()).toBe("43.5"); expect(result.line6.toFixed()).toBe("0");
  const huge = actualTipIncome(); huge.employers[0]!.cashAndChargeTipsReceived = "9007199254740993.01";
  expect(buildTipIncomeInputs([huge], "single", 2025, [actualTipW2])?.primary?.sourceFacts?.employers?.[0]?.cashAndChargeTipsReceived).toBe("9007199254740993.01");
});
it("binds tip sources to actual canonical employer and owner records", () => {
  expect(tipIncomeW2Sources([{ ...emptyW2Entry }, actualTipW2]).map(row => row.sourceId)).toEqual(["formW2:0"]);
  expect(buildTipIncomeInputs([actualTipIncome()], "single", 2025, [{ ...emptyW2Entry }, actualTipW2])?.primary).toBeDefined();
  for (const w2 of [{ ...actualTipW2, employerEin: "98-7654321" }, { ...actualTipW2, accountHolder: "spouse" as const }, { ...actualTipW2, socialSecurityTips: "" }, { ...actualTipW2, allocatedTips: "100" }]) {
    expect(() => buildTipIncomeInputs([actualTipIncome()], "mfj", 2025, [w2])).toThrow();
  }
  const spouse = actualTipIncome(); spouse.accountHolder = "spouse";
  expect(buildTipIncomeInputs([spouse], "mfj", 2025, [{ ...actualTipW2, accountHolder: "spouse" }])?.spouse?.accountHolder).toBe("spouse");
  expect(() => buildTipIncomeInputs([spouse], "single", 2025, [{ ...actualTipW2, accountHolder: "spouse" }])).toThrow(/joint/i);
  const unresolved = actualTipIncome(); unresolved.employers[0]!.w2SourceIds = ["formW2:00"];
  expect(() => buildTipIncomeInputs([unresolved], "single", 2025, [actualTipW2])).toThrow(/source/i);
});
it("rejects missing tip facts while accepting explicit zero and false", () => {
  expect(buildTipIncomeInputs(undefined, "single", 2025, [])).toBeUndefined();
  expect(buildTipIncomeInputs([], "single", 2025, [])).toEqual({});
  for (const field of ["sourceFactsConfirmed", "allEmployersIncluded", "reportingYearTreatmentConfirmed"] as const) {
    const missing = actualTipIncome(); missing[field] = null;
    expect(() => buildTipIncomeInputs([missing], "single", 2025, [actualTipW2])).toThrow();
  }
  for (const value of ["", "-1", "NaN", "Infinity"]) {
    const missing = actualTipIncome(); missing.employers[0]!.allocatedTips = value;
    expect(() => buildTipIncomeInputs([missing], "single", 2025, [actualTipW2])).toThrow();
  }
  const sources = actualTipIncome(); sources.noncashTipsNotIncludedInWages = "0";
  expect(buildTipIncomeInputs([sources], "single", 2025, [actualTipW2])?.primary?.sourceFacts?.employers?.[0]?.railroadRetirementCovered).toBe(false);
  expect(() => buildTipIncomeInputs([sources, sources], "single", 2025, [actualTipW2])).toThrow(/duplicate/i);
  expect(() => buildTipIncomeInputs([sources], "single", 2026, [actualTipW2])).toThrow(/year/i);
  sources.employers[0]!.railroadRetirementCovered = true;
  expect(() => buildTipIncomeInputs([sources], "single", 2025, [actualTipW2])).toThrow(/railroad|RRTA/i);
});

it("routes actual tip sources and invalidates changed payroll without deleting facts", async () => {
  const { buildSectionRoute, updateSectionData, validateSection } = await import("@/lib/guided-interview-flow");
  const { buildTaxInputFromGuidedData } = await import("@/lib/guided-interview-bridge");
  const { startCompleteInterview } = await import("./complete-facts");
  const state = startCompleteInterview({ filingStatus: "single", incomeTypes: ["w2-wages"], lifeEvents: ["additional-deductions"], stateCode: null });
  expect(buildSectionRoute(state.segmentation).map(section => section.id)).toContain("additional-deductions");
  state.sectionData["income-w2"] = { entries: [{ ...emptyW2Entry }, actualTipW2] };
  state.sectionData["additional-deductions"] = { tipIncomeAccounts: [actualTipIncome()] };
  expect(validateSection(state, "additional-deductions").status).toBe("complete");
  expect(buildTaxInputFromGuidedData(state)?.form4137ByOwner?.primary?.sourceFacts?.noncashTipsNotIncludedInWages).toBe("25.5");
  const changed = updateSectionData(state, "income-w2", { entries: [{ ...actualTipW2, socialSecurityTips: "6999" }] });
  expect(changed.sectionData["additional-deductions"]?.tipIncomeAccounts?.[0]?.sourceFactsConfirmed).toBeNull();
  expect(changed.sectionData["additional-deductions"]?.tipIncomeAccounts?.[0]?.employers[0]?.tipsReportedToEmployer).toBe("7000");
  expect(buildTaxInputFromGuidedData(changed)).toBeNull();
  const unchanged = updateSectionData(state, "income-w2", structuredClone(state.sectionData["income-w2"]));
  expect(unchanged.sectionData["additional-deductions"]?.tipIncomeAccounts?.[0]?.sourceFactsConfirmed).toBe(true);
  const missing = structuredClone(state); missing.sectionData["additional-deductions"]!.tipIncomeAccounts![0]!.sourceFactsConfirmed = null;
  expect(validateSection(missing, "additional-deductions").status).not.toBe("complete"); expect(buildTaxInputFromGuidedData(missing)).toBeNull();
});

it("preserves actual Box8 and rejects pending payroll suggestions", async () => {
  const { buildW2Inputs } = await import("@/lib/guided-interview-bridge");
  const { w2FactErrors } = await import("@/lib/guided-w2-facts");
  expect(buildW2Inputs([{ ...actualTipW2, allocatedTips: "" }])[0]?.allocatedTips).toBeUndefined();
  expect(buildW2Inputs([{ ...actualTipW2, allocatedTips: "0" }])[0]?.allocatedTips).toBe("0");
  expect(buildW2Inputs([{ ...actualTipW2, allocatedTips: "9007199254740993.01" }])[0]?.allocatedTips).toBe("9007199254740993.01");
  expect(w2FactErrors([{ ...actualTipW2, allocatedTips: "-1" }], "single")).toHaveProperty("w2-0-allocatedTips");
  expect(w2FactErrors([{ ...actualTipW2, allocatedTips: "NaN" }], "single")).toHaveProperty("w2-0-allocatedTips");
  expect(() => buildTipIncomeInputs([actualTipIncome()], "single", 2025, [{ ...actualTipW2, aiSuggestedFields: { socialSecurityTips: { status: "pending-confirmation", sourceLabel: "Actual document" } } }])).toThrow(/confirm/i);
});
