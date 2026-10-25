// Spec: spec/federal/marketplace-net-operating-loss.yaml.
import { expect, it, vi } from "vitest";
vi.mock("@/models/constants.js", async importOriginal => {
  const original = await importOriginal<typeof import("@/models/constants.js")>();
  const { FEDERAL_2026_CONSTANTS } = await import("@/models/federal-2026-indexed.js");
  return { ...original, getConstants: (year: number) => year === 2026 ? FEDERAL_2026_CONSTANTS : original.getConstants(year) };
});
import { calculateFederalTax } from "@/engine/federal.js";
import { TaxYearInputSchema } from "@/models/inputs.js";
import { marketplaceNolInput as source } from "../fixtures/marketplace-nol.js";
it("recomputes actual NOL at each capped health step and retains only final carry", () => {
  const result = calculateFederalTax(source());
  expect(result.allLines.find(row => row.form === "Pub974 Worksheet X" && row.line === "14")?.value.toFixed()).toBe("30707");
  expect(result.allLines.find(row => row.form === "Pub974 Worksheet X" && row.line === "25")?.value.toFixed()).toBe("975");
  expect(result.marketplaceHealthInsurance?.step2Credit.toFixed()).toBe("5365");
  expect(result.schedule1?.seHealthInsurance.toFixed()).toBe("635");
  expect(result.nolDeduction.toFixed()).toBe("61240");
  expect(result.agi.toFixed()).toBe("31060");
  expect(result.form8962?.ptcAllowed.toFixed()).toBe("5304");
  expect(result.carryforwards.nolCarryforward.toFixed()).toBe("38760");
  expect(result.netOperatingLoss?.deduction.eq(result.nolDeduction)).toBe(true);
  expect(result.netOperatingLoss?.finalIncome.agi.eq(result.agi)).toBe(true);
  expect(result.allLines.filter(row => row.form === "Section172 Canonical Income" && row.line === "actual-limit")).toHaveLength(1);
  expect(result.allLines.some(row => /^Pub974 Worksheet [YZ]/.test(row.form))).toBe(false);
});
it("refigures modified carry income with the final health deduction", () => {
  const input = TaxYearInputSchema.parse({ ...source(), priorYear: { shortTermCapitalLoss: "-3000" } });
  const result = calculateFederalTax(input);
  expect(result.allLines.find(row => row.form === "Pub974 Worksheet X" && row.line === "14")?.value.toFixed()).toBe("30107");
  expect(result.schedule1?.seHealthInsurance.toFixed()).toBe("589");
  expect(result.nolDeduction.toFixed()).toBe("58877");
  expect(result.agi.toFixed()).toBe("30469");
  expect(result.form8962?.ptcAllowed.toFixed()).toBe("5366");
  expect(result.netOperatingLoss?.absorbed.toFixed()).toBe("61277");
  expect(result.carryforwards.nolCarryforward.toFixed()).toBe("38723");
});
it("recomputes the isolated uncapped source result without an interim eligibility override", () => {
  const result = calculateFederalTax(source(2026));
  expect(result.marketplaceHealthInsurance?.step2Credit.toFixed()).toBe("4105");
  expect(result.schedule1?.seHealthInsurance.toFixed()).toBe("1895");
  expect(result.nolDeduction.toFixed()).toBe("59952");
  expect(result.agi.toFixed()).toBe("31088");
  expect(result.form8962?.ptcAllowed.toFixed()).toBe("3979");
  expect(result.carryforwards.nolCarryforward.toFixed()).toBe("40048");
  expect(result.form8962?.orderedDeductionInterim).not.toBe(true);
  expect(result.allLines.some(row => /^Pub974 Worksheet [XYZ]/.test(row.form))).toBe(false);
});
it("refigures NOL limit contexts while retaining the actual ordered IRA only on the final return", () => {
  const input = source();
  input.iraDeductionWorksheet = { primaryContributions: "7000", primaryIsActiveParticipant: true,
    primaryCompensation: "92935", primarySection501c18Contributions: "0", primaryRothContributions: "0", sourceFactsConfirmed: true };
  const result = calculateFederalTax(input);
  expect(result.allLines.find(row => row.form === "Pub974 Worksheet Y" && row.line === "3")?.value.toFixed()).toBe("23707");
  expect(result.schedule1?.seHealthInsurance.toFixed()).toBe("57");
  expect(result.netOperatingLoss?.actualIncome.iraDeduction.toFixed()).toBe("0");
  expect(result.netOperatingLoss?.modifiedIncome.iraDeduction.toFixed()).toBe("0");
  expect(result.iraDeductionWorksheet?.totalDeduction.toFixed()).toBe("7000");
  expect(result.nolDeduction.toFixed()).toBe("61702");
  expect(result.agi.toFixed()).toBe("24176");
  expect(result.form8962?.ptcAllowed.toFixed()).toBe("5903");
  expect(result.carryforwards.nolCarryforward.toFixed()).toBe("38298");
});
it("retains final no-credit health and repayment with actual NOL sources", () => {
  const input = source(2026);
  const vintage = input.netOperatingLoss?.vintages?.[0];
  if (!vintage) throw new Error("Missing synthetic loss vintage");
  vintage.originalLoss = "10000"; vintage.openingCarryforward = "10000";
  const result = calculateFederalTax(input);
  expect(result.marketplaceHealthInsurance?.method).toBe("ordinary-no-ptc-2026");
  expect(result.schedule1?.seHealthInsurance.toFixed()).toBe("6000");
  expect(result.nolDeduction.toFixed()).toBe("10000");
  expect(result.agi.toFixed()).toBe("76935");
  expect(result.form8962?.ptcAllowed.toFixed()).toBe("0");
  expect(result.form8962?.excessAPTCRepayment.toFixed()).toBe("3600");
  expect(result.carryforwards.nolCarryforward.toFixed()).toBe("0");
});
it("retains independent final AMT and investment ledgers without interim source transfers", () => {
  const input = source();
  const vintage = input.netOperatingLoss?.vintages?.[0];
  if (!vintage || !input.netOperatingLoss?.alternativeTax) throw new Error("Missing synthetic loss sources");
  vintage.section1411OriginalLoss = "30000";
  input.netOperatingLoss.alternativeTax.vintages = [{ ...vintage, sourceId: "amt2021", section1411OriginalLoss: undefined }];
  const result = calculateFederalTax(input);
  expect(result.nolDeduction.toFixed()).toBe("61240");
  expect(result.netOperatingLoss?.alternativeTax.amtiBeforeAtnol.toFixed()).toBe("89238");
  expect(result.netOperatingLoss?.alternativeTax.deduction.toFixed()).toBe("80314");
  expect(result.netOperatingLoss?.alternativeTax.modifiedAmtiBeforeAtnol.toFixed()).toBe("92300");
  expect(result.netOperatingLoss?.alternativeTax.absorbed.toFixed()).toBe("83070");
  expect(result.netOperatingLoss?.alternativeTax.carryforward.toFixed()).toBe("16930");
  expect(result.netOperatingLoss?.section1411Deduction.toFixed()).toBe("18372");
  for (const [form,line,amount] of [["Form 6251","2e","61240"],["Form 6251","2f","-80314"],["Form 8960","7","-18372"]]) {
    expect(result.allLines.filter(row => row.form === form && row.line === line).map(row => row.value.toFixed())).toEqual([amount]);
  }
  expect(result.allLines.filter(row => row.form === "QBI Source Deductions" && row.line === "scheduleC")
    .map(row => row.inputs["SE health insurance"].toString())).toEqual(["635"]);
});
it("recomputes temporary business allocations and validates the actual final source amounts", () => {
  const original = source();
  const plan = original.form7206?.plans?.[0];
  if (!plan || !original.form7206) throw new Error("Missing synthetic policy");
  const input = TaxYearInputSchema.parse({ ...original,
    scheduleC: { accountHolder: "primary", businessName: "Actual proprietor", grossReceipts: "50000", qbiMateriallyParticipated: true },
    scheduleF: { accountHolder: "primary", principalCropOrActivity: "Actual farm", salesOfProductsRaised: "50000", qbiMateriallyParticipated: true },
    form1095A: [0,1].map(index => ({ ...original.form1095A[0], policyNumber: `ACTUAL-${index}`,
      monthlyPremiums: original.form1095A[0].monthlyPremiums.filter(row => index === 0 ? row.month <= 6 : row.month > 6) })),
    form7206: { ...original.form7206, plans: [0,1].map(index => ({ ...plan, planId: `actual-${index}`,
      businessSourceId: index === 0 ? "scheduleC" : "scheduleF", marketplacePolicySourceIds: [`form1095A:${index}`],
      months: plan.months?.filter(row => index === 0 ? (row.month ?? 0) <= 6 : (row.month ?? 0) > 6),
      payments: plan.payments?.filter(row => index === 0 ? (row.coverageMonth ?? 0) <= 6 : (row.coverageMonth ?? 0) > 6) })) },
    qbiDeductionAllocations: { sourceFactsConfirmed: true, rows: ["scheduleC","scheduleF"].map(sourceId => ({
      sourceId, accountHolder: "primary", deductibleSelfEmploymentTax: "3532.5", selfEmployedHealthInsurance: "318", selfEmployedRetirementPlans: "0" })) },
  });
  const result = calculateFederalTax(input);
  expect(result.marketplaceHealthInsurance?.step2Credit.toFixed()).toBe("5364");
  expect(result.schedule1?.seHealthInsurance.toFixed()).toBe("636");
  expect(result.nolDeduction.toFixed()).toBe("61239");
  expect(result.agi.toFixed()).toBe("31060");
  expect(result.allLines.filter(row => row.form === "Pub974 QBI Allocation").map(row => row.value.toFixed())).toEqual(["318","318"]);
  if (!input.qbiDeductionAllocations?.rows[0]) throw new Error("Missing synthetic allocation");
  input.qbiDeductionAllocations.rows[0].selfEmployedHealthInsurance = "317";
  expect(() => calculateFederalTax(input)).toThrow(/QBI health.*reconcile/);
});
