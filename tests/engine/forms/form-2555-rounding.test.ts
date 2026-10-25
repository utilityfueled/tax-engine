// Spec: spec/federal/form-2555-rounding.yaml.
import { expect, it } from "vitest";
import { calculateForm2555 } from "@/engine/forms/form-2555.js";
import { Form2555Schema } from "@/models/inputs.js";
import { getConstants } from "@/models/constants.js";

function facts() {
  return { taxYear: 2025, foreignEarnedIncome: "200.80", qualifyingDays: 365, totalDaysInYear: 365,
    qualifiedHousingExpenses: "0", employerProvidedForeignEarnedIncome: "100.40", isSelfEmployed: true,
    sourceFactsConfirmed: true, eligibilityConfirmed: true, electionsValidConfirmed: true,
    claimForeignEarnedIncomeExclusion: true, claimHousingExclusionOrDeduction: false, housingExpensesQualificationConfirmed: true,
    deductionsAllocableToExcludedIncome: "0", priorYearHousingDeductionCarryover: "0", priorYearIncomeExclusion: "0",
    incomeSourceMappingConfirmed: true,
    partIV: { wages: "100.40", businessPersonalServices: "100.40", partnershipPersonalServices: "0", noncashLodging: "0", noncashMeals: "0", noncashCar: "0", noncashOther: "0", allowanceCostOfLiving: "0", allowanceFamily: "0", allowanceEducation: "0", allowanceHomeLeave: "0", allowanceQuarters: "0", allowanceOther: "0", otherEarnedIncome: "0", section119MealsAndLodging: "0" },
    incomeSources: { foreignEmploymentIncomeIncludedOnW2: "100.40", foreignEmploymentIncomeNotOnW2: "0", foreignBusinessIncomeAlreadyReported: "100.40", foreignPartnershipIncomeAlreadyReported: "0", otherForeignIncomeAlreadyReported: "0" } };
}
function calc(value = facts()) { return calculateForm2555(Form2555Schema.parse(value), getConstants(2025)); }
const line = (result: ReturnType<typeof calc>, id: string) => result.lines.find(row => row.line === id)?.value.toFixed();

it("derives printed income from reconciled original PartIV amounts", () => {
  const actual = facts(), original = JSON.stringify(actual), result = calc(actual);
  expect(line(result, "19")).toBe("100"); expect(line(result, "20a")).toBe("100");
  expect(line(result, "24")).toBe("201"); expect(line(result, "26")).toBe("201");
  expect(result.foreignEarnedIncomeExclusion.toFixed()).toBe("201");
  expect(JSON.stringify(actual)).toBe(original);
});

it("preserves all-employment and mixed-source shares after whole-dollar rounding", () => {
  const all = facts(); all.isSelfEmployed = false;
  all.partIV.businessPersonalServices = "0"; all.partIV.noncashCar = "100.40";
  all.employerProvidedForeignEarnedIncome = all.incomeSources.foreignEmploymentIncomeIncludedOnW2 = "200.80";
  all.incomeSources.foreignBusinessIncomeAlreadyReported = "0";
  const employed = calc(all);
  expect(line(employed, "27")).toBe("201"); expect(line(employed, "34")).toBe("201"); expect(line(employed, "35")).toBe("1");
  const mixed = calc(); expect(line(mixed, "34")).toBe("100"); expect(line(mixed, "35")).toBe("0.5");
  const section119 = facts(); section119.partIV.noncashLodging = "10.60"; section119.partIV.section119MealsAndLodging = "10.60";
  expect(line(calc(section119), "24")).toBe("211"); expect(line(calc(section119), "25")).toBe("11");
  expect(line(calc(section119), "26")).toBe("201");
  const small = structuredClone(all); small.foreignEarnedIncome = small.employerProvidedForeignEarnedIncome = small.incomeSources.foreignEmploymentIncomeIncludedOnW2 = "100.40";
  small.partIV.wages = "100.40"; small.partIV.noncashCar = "0"; small.partIV.noncashLodging = small.partIV.section119MealsAndLodging = "0.20";
  const tiny = calc(small); expect(line(tiny, "24")).toBe("101"); expect(line(tiny, "25")).toBe("0"); expect(line(tiny, "26")).toBe("100"); expect(line(tiny, "35")).toBe("1");
  const housing = facts(); housing.foreignEarnedIncome = "300000.80";
  housing.partIV.wages = housing.partIV.businessPersonalServices = housing.employerProvidedForeignEarnedIncome
    = housing.incomeSources.foreignEmploymentIncomeIncludedOnW2 = housing.incomeSources.foreignBusinessIncomeAlreadyReported = "150000.40";
  housing.claimHousingExclusionOrDeduction = true; housing.qualifiedHousingExpenses = "30000";
  const withHousing = { ...housing, housingLocationPeriods: [{ locationId: "default", days: 365 }] };
  const allocated = calc(withHousing);
  expect(line(allocated, "27")).toBe("300001"); expect(line(allocated, "35")).toBe("0.5");
  expect(line(allocated, "36")).toBe("4600"); expect(line(allocated, "42")).toBe("130000");
  expect(line(allocated, "50")).toBe("4600");
});

it("rejects source disagreements hidden by rounding", () => {
  const integer = facts(); integer.foreignEarnedIncome = "200"; integer.employerProvidedForeignEarnedIncome = "100";
  integer.partIV.wages = integer.partIV.businessPersonalServices = integer.incomeSources.foreignEmploymentIncomeIncludedOnW2 = integer.incomeSources.foreignBusinessIncomeAlreadyReported = "100";
  const part = structuredClone(integer); part.partIV.wages = "100.01";
  expect(() => calc(part)).toThrow(/source|PartIV|reconcil/);
  const mapping = structuredClone(integer); mapping.incomeSources.foreignEmploymentIncomeIncludedOnW2 = "100.01";
  expect(() => calc(mapping)).toThrow(/source|reconcil/);
  const employer = structuredClone(integer); employer.employerProvidedForeignEarnedIncome = "100.01";
  expect(() => calc(employer)).toThrow(/source|reconcil/);
  const meals = structuredClone(integer); meals.partIV.noncashMeals = "0.10"; meals.partIV.section119MealsAndLodging = "0.11"; meals.foreignEarnedIncome = "199.99";
  expect(() => calc(meals)).toThrow(/section119/);
});
