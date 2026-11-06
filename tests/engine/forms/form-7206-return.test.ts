// Spec: spec/federal/form-7206-return.yaml.
import Decimal from "decimal.js";
import { expect, it } from "vitest";
import { calculateForm7206Return } from "@/engine/forms/form-7206-return.js";
import { TaxYearInputSchema } from "@/models/inputs.js";
import { simpleW2Fixture } from "../../fixtures/simple-w2.js";
import { healthFacts } from "../../fixtures/form7206.js";
const d = (v: string | number) => new Decimal(v);
const foreignFacts = { foreignEarnedIncome: "2000", qualifyingDays: 365, totalDaysInYear: 365, qualifiedHousingExpenses: "0", isSelfEmployed: true,
  incomeSourceMappingConfirmed: true, incomeSources: { foreignEmploymentIncomeIncludedOnW2: "1500", foreignEmploymentIncomeNotOnW2: "0",
    foreignBusinessIncomeAlreadyReported: "500", foreignPartnershipIncomeAlreadyReported: "0", otherForeignIncomeAlreadyReported: "0" } };
function run(overrides: Record<string, unknown> = {}, foreign = "0") {
  const input = TaxYearInputSchema.parse({ ...simpleW2Fixture, w2s: [], scheduleC: { accountHolder: "primary", businessName: "Primary source", grossReceipts: "30000" },
    scheduleF: { accountHolder: "primary", principalCropOrActivity: "Actual crop" }, form7206: healthFacts("scheduleC", "30000"), ...(foreign === "0" ? {} : { form2555: foreignFacts }), ...overrides });
  return calculateForm7206Return({ input, scheduleCProfit: d(30000), scheduleFProfit: d(-10000), cryptoBusinessProfit: d(70000),
    selfEmploymentDeductions: [{ accountHolder: "primary", amount: d(6000) }, ...(input.taxpayer.filingStatus === "married_filing_jointly" ? [{ accountHolder: "spouse" as const, amount: d(1000) }] : [])],
    selfEmploymentSourcesVerified: true,
    foreignIncomeExclusion: d(foreign) });
}
it("separates owner income and ignores loss sources in the positive denominator", () => {
  const joint = { ...simpleW2Fixture.taxpayer, filingStatus: "married_filing_jointly", spouse: { firstName: "John", lastName: "Doe", ssn: "555-55-5555", dateOfBirth: "1991-01-02" } };
  const result = run({ taxpayer: joint, cryptoIncome: { businessAccountHolder: "spouse" } });
  expect(result.form7206.businesses[0]?.ownerPositiveBusinessIncome?.toString()).toBe("30000");
  expect(result.form7206.businesses[0]?.allocatedSelfEmploymentTax?.toString()).toBe("6000");
  expect(result.form7206.deduction?.toString()).toBe("24000");
  expect(() => run({ taxpayer: joint, scheduleC: { businessName: "Missing owner", grossReceipts: "30000" } })).toThrow(/owner/i);
});
it("requires reconciled retirement and foreign allocations without inventing zero", () => {
  const adjustments = { seRetirementContributions: "1000" };
  expect(() => run({ adjustments }, "2000")).toThrow(/allocation|attribution/i);
  const incomeDeductions = { sourceReference: "Actual attributable deductions worksheet", sourceFactsConfirmed: true, otherForeignExclusion: "1500",
    allocations: [{ businessSourceId: "scheduleC", accountHolder: "primary", retirementDeduction: "1000", foreignExclusion: "500" }] };
  const actual = { ...healthFacts("scheduleC", "30000"), incomeDeductions };
  const result = run({ adjustments, form7206: actual }, "2000");
  // Primary positives30000+70000;6000*.3=1800;30000-1800-1000-500=26700.
  expect(result.form7206.deduction?.toString()).toBe("26700");
  expect(result.retirementSources).toMatchObject([{ sourceId: "scheduleC", accountHolder: "primary" }]);
  expect(result.retirementSources[0]?.amount.toString()).toBe("1000");
  for (const bad of [
    { ...incomeDeductions, otherForeignExclusion: "1499" },
    { ...incomeDeductions, sourceFactsConfirmed: false },
    { ...incomeDeductions, allocations: [{ ...incomeDeductions.allocations[0], retirementDeduction: "999" }] },
    { ...incomeDeductions, allocations: [{ ...incomeDeductions.allocations[0], accountHolder: "spouse" }] },
  ]) expect(() => run({ adjustments, form7206: { ...actual, incomeDeductions: bad } }, "2000")).toThrow(/reconcile|confirm|owner/i);
});

it("rejects foreign allocations contradicting the actual income source class", () => {
  const form7206 = { ...healthFacts("scheduleC", "30000"), incomeDeductions: {
    sourceReference: "Actual foreign attribution", sourceFactsConfirmed: true, otherForeignExclusion: "1500",
    allocations: [{ businessSourceId: "scheduleC", accountHolder: "primary", retirementDeduction: "0", foreignExclusion: "500" }],
  } };
  const wageOnly = { ...foreignFacts, incomeSources: { ...foreignFacts.incomeSources,
    foreignEmploymentIncomeIncludedOnW2: "2000", foreignBusinessIncomeAlreadyReported: "0" } };
  expect(() => run({ form7206, form2555: wageOnly }, "2000")).toThrow(/source|foreign/i);
  expect(() => run({ form7206, form2555: { ...foreignFacts, incomeSourceMappingConfirmed: false } }, "2000")).toThrow(/confirmed|mapping/i);
  expect(run({ form7206 }, "2000").form7206.deduction?.toString()).toBe("27700");
});
