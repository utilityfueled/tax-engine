// Spec: spec/federal/guided-government-payment-worksheets.yaml, cash-farm-box7.
import { expect, it } from "vitest";
import { calculateFederalTax } from "@/engine/federal";
import { calculateForm1099G } from "@/engine/forms/form-1099-g";
import { calculateScheduleF } from "@/engine/schedules/schedule-f";
import { calculateScheduleSE } from "@/engine/schedules/schedule-se";
import { FEDERAL_2026_CONSTANTS } from "@/models/federal-2026-indexed";
import { TaxYearInputSchema } from "@/models/inputs";
import { buildTaxInputFromGuidedData } from "@/lib/guided-interview-bridge";
import { updateSectionData, validateSection } from "@/lib/guided-interview-flow";
import { completeUnemploymentSource, startCompleteInterview } from "./complete-facts";

function originals() {
  const state = startCompleteInterview({ filingStatus: "single", incomeTypes: ["unemployment"], lifeEvents: [], stateCode: null });
  state.taxYear = 2026;
  const statement = {
    ...completeUnemploymentSource, sourceTaxYear: "2026", sourceFormRevision: "2026-12",
    payer: "Synthetic USDA office", payerTin: "12-3456789", accountReference: "USDA A",
    programType: "other-government" as const, compensation: "0", federalWithheld: "31.27", agriculturePayments: "800.24", familyLeaveBenefits: "0",
  };
  const another = { ...statement, payerTin: "98-7654321", agriculturePayments: "200.17", federalWithheld: "0" };
  const farm = {
    owner: "primary" as const, sourceYear: "2026", farmReference: "farm books 2026", principalActivity: "Market vegetables",
    scopeConfirmed: true, sourceFactsConfirmed: true,
    raisedProductSales: "2500.65", seeds: "100.52", supplies: "0", utilities: "0", fuel: "0", repairs: "0", qualifiedPropertyBasis: "0",
    receipts: [
      { program: "ordinary-taxable-usda" as const, payerTin: "123456789", statementReference: "USDA A", reference: "January deposit", receivedDate: "2026-01-12", amount: "500.10" },
      { program: "ordinary-taxable-usda" as const, payerTin: "123456789", statementReference: "USDA A", reference: "July deposit", receivedDate: "2026-07-11", amount: "300.14" },
      { program: "ordinary-taxable-usda" as const, payerTin: "987654321", statementReference: "USDA A", reference: "Other office deposit", receivedDate: "2026-09-10", amount: "200.17" },
    ],
  };
  const data = { compensation: "0", federalWithheld: "31.27", entries: [statement, another], cashFarm: farm };
  state.sectionData["income-unemployment"] = data;
  return { state, data, farm, statement, another };
}

it("routes exact ordinary USDA receipts to Schedule F once after saved statements reorder", () => {
  const { state, data, another, statement } = originals();
  state.sectionData["income-unemployment"] = { ...data, entries: [another, statement] };
  expect(validateSection(state, "income-unemployment").fieldErrors).toEqual({});
  const saved = JSON.parse(JSON.stringify(state)) as typeof state;
  const canonical = TaxYearInputSchema.parse(buildTaxInputFromGuidedData(saved));
  expect(canonical.scheduleF?.agriculturalProgramPayments).toBe("1000.41");
  expect(canonical.scheduleF?.agriculturalPaymentSources?.payments.map(row => row.form1099GSourceId)).toEqual(["government-source-2", "government-source-2", "government-source-1"]);
  const farm = calculateScheduleF(canonical.scheduleF);
  const government = calculateForm1099G(canonical.form1099G ?? [], 2026, "single", canonical);
  expect(farm.netFarmProfit.toFixed(2)).toBe("3400.54");
  expect(government.taxableUnemployment.toFixed()).toBe("0");
  expect(government.otherIncome.toFixed()).toBe("0");
  expect(government.federalWithheld.toFixed(2)).toBe("31.27");
  expect(calculateScheduleSE(canonical, FEDERAL_2026_CONSTANTS).totalSETax.toFixed()).toBe("480");
  expect(() => calculateFederalTax(canonical)).toThrow(/2026 rule pack.*incomplete/i);

  saved.taxYear = 2025;
  saved.sectionData["income-unemployment"] = {
    ...data,
    entries: [another, statement].map(row => ({ ...row, sourceTaxYear: "2025", sourceFormRevision: "2024-03", familyLeaveBenefits: undefined })),
    cashFarm: { ...data.cashFarm, sourceYear: "2025", receipts: data.cashFarm.receipts.map(row => ({ ...row, receivedDate: row.receivedDate.replace(/^2026-/, "2025-") })) },
  };
  const federal = calculateFederalTax(TaxYearInputSchema.parse(buildTaxInputFromGuidedData(saved)));
  expect(federal.scheduleF?.netFarmProfit.toFixed(2)).toBe("3400.54");
  expect(federal.schedule1?.farmIncome.toFixed(2)).toBe("3400.54");
  expect(federal.schedule1?.unemploymentCompensation.toFixed()).toBe("0");
  expect(federal.totalWithholding.toFixed(2)).toBe("31.27");
});

it("blocks incomplete conflicting out-of-scope and edited farm originals", () => {
  const { state, data, farm } = originals();
  const [first, second, third] = farm.receipts;
  if (!first || !second || !third) throw new Error("Missing original receipt fixtures");
  for (const cashFarm of [undefined, { ...farm, seeds: "" }, { ...farm, qualifiedPropertyBasis: "" }, { ...farm, scopeConfirmed: false },
    { ...farm, sourceYear: "2025" }, { ...farm, owner: "spouse" as const }, { ...farm, seeds: "5000" },
    { ...farm, receipts: [{ ...first, receivedDate: "2026-02-30" }, second, third] },
    { ...farm, receipts: [{ ...first, program: "other" as const }, second, third] },
    { ...farm, receipts: [{ ...first, amount: "500.11" }, second, third] },
    { ...farm, receipts: [first, { ...second, reference: " JANUARY   deposit " }, third] }]) {
    state.sectionData["income-unemployment"] = { ...data, cashFarm };
    expect(buildTaxInputFromGuidedData(state)).toBeNull();
  }
  state.sectionData["income-unemployment"] = data;
  expect(buildTaxInputFromGuidedData({ ...state, segmentation: { ...state.segmentation, stateCode: "OH" } })).toBeNull();
  const edited = updateSectionData(state, "income-unemployment", { ...data, cashFarm: { ...farm, seeds: "100.53" } });
  expect(edited.sectionData["income-unemployment"]?.cashFarm?.sourceFactsConfirmed).toBeNull();
  expect(buildTaxInputFromGuidedData(edited)).toBeNull();
});
