// Spec: spec/federal/schedule-a.yaml#5a-source-withholding.
import { describe, expect, it } from "vitest";
import { calculateStateLocalIncomeTaxDeduction } from "@/engine/forms/state-local-income-tax-deduction.js";
import { calculateFederalTax } from "@/engine/federal.js";
import { calculateScheduleA } from "@/engine/schedules/schedule-a.js";
import { FEDERAL_2026_CONSTANTS } from "@/models/federal-2026-indexed.js";
import { d } from "@/utils/decimal.js";
import { TaxYearInputSchema } from "@/models/inputs.js";
import { simpleW2Fixture } from "../../fixtures/simple-w2.js";

function fixture() {
  return TaxYearInputSchema.parse({
    ...simpleW2Fixture,
    w2s: [{ ...simpleW2Fixture.w2s[0], stateTaxWithheld: "100", localTaxWithheld: "50" }],
    form1099Int: [{ payer: "Synthetic", interestIncome: "0", stateWithheld: "11" }],
    form1099Div: [{ payer: "Synthetic", ordinaryDividends: "0", stateWithheld: "12" }],
    form1099B: [{ broker: "Synthetic", transactions: [], stateWithheld: "13" }],
    form1099DA: [{ brokerName: "Synthetic", transactions: [], stateWithheld: "14" }],
    form1099Nec: [{ payer: "Synthetic", nonemployeeCompensation: "0", stateWithheld: "15" }],
    form1099Misc: [{ payer: "Synthetic", stateWithheld: "16" }],
    form1099G: [{ payer: "Synthetic", unemploymentCompensation: "0", stateWithheld: "17" }],
    formW2G: [{ payer: "Synthetic", reportableWinnings: "0", stateWithheld: "18" }],
    form1099K: [{ pse: "Synthetic", grossAmount: "0", incomeType: "other", stateWithheld: "19" }],
    form1099R: [{ payer: "Synthetic", grossDistribution: "0", taxableAmount: "0", distributionCode: "7", stateWithheld: "20", stateTaxWithheld: "20", localTaxWithheld: "21" }],
    scheduleA: { additionalStateLocalIncomeTaxes: "60", nonW2IncomeTaxesDeductedElsewhere: "16" },
    adjustments: {
      estimatedTaxPayments: [{ date: "2025-09-15", amount: "30", type: "state", state: "NY" }],
      extensionPayments: [{ date: "2025-04-15", amount: "40", type: "state", state: "NY" }],
      priorYearAppliedCredits: [{ sourceTaxYear: 2024, amount: "50", type: "state", state: "NY" }],
    },
  });
}
describe("State/local income-tax source deduction", () => {
  it("includes modeled source withholding once and reconciles other-schedule deductions", () => {
    const result = calculateStateLocalIncomeTaxDeduction(fixture());
    expect(result.w2StateWithholding.toString()).toBe("100");
    expect(result.w2LocalWithholding.toString()).toBe("50");
    expect(result.nonW2Withholding.toString()).toBe("176");
    expect(result.deductedElsewhere.toString()).toBe("16");
    expect(result.statePaymentsInYear.toString()).toBe("120");
    expect(result.total.toString()).toBe("490");
  });
  it("uses all actual withholding in the sales-tax comparison", () => {
    const input = fixture();
    const result = calculateFederalTax({ ...input, salesTaxDeduction: { state: "NY", method: "actual", actualGeneralSalesTax: "450", specificPurchaseSalesTax: [], autoCompare: true, localSalesTaxRate: "0" } });
    expect(result.scheduleA.lines.find((line) => line.line === "5a")?.value.toString()).toBe("490");
    expect(result.allLines.find((line) => line.form === "Sales Tax WS" && line.line === "cmp")?.value.toString()).toBe("490");
    input.taxpayer.taxYear = 2026;
    delete input.scheduleA?.nonW2IncomeTaxesDeductedElsewhere;
    const elected = calculateScheduleA(input, d(85000), "single", FEDERAL_2026_CONSTANTS, { salesTaxElected: true, salesTaxDeduction: d(450) });
    expect(elected.lines.find(line => line.form === "Sched A" && line.line === "5a")?.value.toString()).toBe("450");
  });
  it("rejects unknown or contradictory withholding allocation facts", () => {
    const input = fixture();
    input.taxpayer.taxYear = 2026;
    delete input.scheduleA?.nonW2IncomeTaxesDeductedElsewhere;
    expect(() => calculateStateLocalIncomeTaxDeduction(input)).toThrow(/unknown|actual/i);
    const knownZero = { ...input, adjustments: undefined, scheduleA: { ...input.scheduleA, nonW2IncomeTaxesDeductedElsewhere: "0" } };
    expect(calculateStateLocalIncomeTaxDeduction(knownZero).total.toString()).toBe("386");
    expect(TaxYearInputSchema.parse(input).scheduleA?.nonW2IncomeTaxesDeductedElsewhere).toBeUndefined();
    const conflict = fixture();
    conflict.form1099R[0].stateTaxWithheld = "19";
    expect(() => calculateStateLocalIncomeTaxDeduction(conflict)).toThrow(/alias|conflict/i);
    for (const invalid of ["177", "-1", "NaN"]) {
      expect(() => calculateStateLocalIncomeTaxDeduction({ ...fixture(), scheduleA: { ...fixture().scheduleA, nonW2IncomeTaxesDeductedElsewhere: invalid } })).toThrow();
    }
  });
});
