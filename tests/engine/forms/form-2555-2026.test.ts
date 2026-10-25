/** Spec: spec/federal/form-2555.yaml. Source-derived fixtures, not provider output. */
import { describe, it, expect } from "vitest";
import { calculateForm2555 } from "@/engine/forms/form-2555.js";
import { Form2555Schema } from "@/models/inputs.js";
import { getConstants } from "@/models/constants.js";
import { FEDERAL_2026_CONSTANTS } from "@/models/federal-2026-indexed.js";

function facts(overrides: Record<string, unknown> = {}) {
  return {
    taxYear: 2026, foreignEarnedIncome: "200000", qualifyingDays: 365, totalDaysInYear: 365,
    qualifiedHousingExpenses: "30000", employerProvidedHousingAmount: "0", isSelfEmployed: false,
    sourceFactsConfirmed: true, eligibilityConfirmed: true, electionsValidConfirmed: true,
    claimForeignEarnedIncomeExclusion: true, claimHousingExclusionOrDeduction: true,
    employerProvidedForeignEarnedIncome: "200000", deductionsAllocableToExcludedIncome: "0",
    priorYearHousingDeductionCarryover: "0", housingExpensesQualificationConfirmed: true,
    incomeSourceMappingConfirmed: true, priorYearIncomeExclusion: "0",
    housingLocationPeriods: [{ locationId: "default", days: 365 }],
    partIV: { wages: "200000", businessPersonalServices: "0", partnershipPersonalServices: "0",
      noncashLodging: "0", noncashMeals: "0", noncashCar: "0", noncashOther: "0",
      allowanceCostOfLiving: "0", allowanceFamily: "0", allowanceEducation: "0", allowanceHomeLeave: "0",
      allowanceQuarters: "0", allowanceOther: "0", otherEarnedIncome: "0", section119MealsAndLodging: "0" },
    incomeSources: { foreignEmploymentIncomeIncludedOnW2: "200000", foreignEmploymentIncomeNotOnW2: "0",
      foreignBusinessIncomeAlreadyReported: "0", foreignPartnershipIncomeAlreadyReported: "0", otherForeignIncomeAlreadyReported: "0" },
    ...overrides,
  };
}
function calc(overrides: Record<string, unknown> = {}) {
  return calculateForm2555(Form2555Schema.parse(facts(overrides)), FEDERAL_2026_CONSTANTS);
}
function selfEmployed(overrides: Record<string, unknown> = {}) {
  const base = facts();
  return { ...base, isSelfEmployed: true, employerProvidedForeignEarnedIncome: "0",
    partIV: { ...base.partIV, wages: "0", businessPersonalServices: "200000" },
    incomeSources: { ...base.incomeSources, foreignEmploymentIncomeIncludedOnW2: "0", foreignBusinessIncomeAlreadyReported: "200000" }, ...overrides };
}
function line(result: ReturnType<typeof calc>, id: string) {
  const matching = result.lines.filter(row => row.form === "2555" && row.line === id);
  expect(matching).toHaveLength(1);
  return matching[0]?.value.toFixed();
}

describe("Form2555 source-backed 2026", () => {
  it("Form2555 2026 computes every source line and net exclusion", () => {
    const base = facts();
    const result = calc({ foreignEarnedIncome: "204500", isSelfEmployed: true,
      employerProvidedForeignEarnedIncome: "163600", deductionsAllocableToExcludedIncome: "7000",
      priorYearHousingDeductionCarryover: "1000", priorYearHousingCarryoverTaxYear: 2025, priorYearHousingCarryoverConfirmed: true,
      partIV: { wages: "160000", businessPersonalServices: "40000", partnershipPersonalServices: "0", noncashLodging: "1000", noncashMeals: "500", noncashCar: "1000", noncashOther: "500", allowanceCostOfLiving: "100", allowanceFamily: "200", allowanceEducation: "300", allowanceHomeLeave: "400", allowanceQuarters: "500", allowanceOther: "600", otherEarnedIncome: "900", section119MealsAndLodging: "1500" },
      incomeSources: { ...base.incomeSources, foreignEmploymentIncomeIncludedOnW2: "163600", foreignBusinessIncomeAlreadyReported: "40000", otherForeignIncomeAlreadyReported: "900" } });
    for (const [id, expected] of Object.entries({ "19": "160000", "20a": "40000", "20b": "0", "21a": "1000", "21b": "500", "21c": "1000", "21d": "500", "22a": "100", "22b": "200", "22c": "300", "22d": "400", "22e": "500", "22f": "600", "22g": "2100", "23": "900", "24": "206000", "25": "1500", "26": "204500", "27": "204500", "28": "30000", "29b": "39870", "30": "30000", "31": "365", "32": "21264", "33": "8736", "34": "163600", "35": "0.8", "36": "6989", "37": "132900", "38": "365", "39": "1", "40": "132900", "41": "197511", "42": "132900", "43": "139889", "44": "7000", "45": "132889", "46": "1747", "47": "64611", "48": "1747", "49": "1000", "50": "2747" })) expect(line(result, id)).toBe(expected);
    expect(result.totalIncomeReduction.toFixed()).toBe("132889");
    expect(result.foreignEarnedIncomeTaxWorksheetAmount.toFixed()).toBe("135636");
    expect(result.sourceFactsVerified).toBe(true);
  });
  it("Form2555 uses published daily housing values instead of annual fractions", () => {
    const result = calc({ qualifyingDays: 276, housingLocationPeriods: [{ locationId: "default", days: 276 }] });
    expect(result.baseHousingAmount.toFixed()).toBe("16080");
    expect(result.housingExpenseLimit.toFixed()).toBe("30147");
    const old = calculateForm2555(Form2555Schema.parse(facts({ taxYear: 2025, qualifyingDays: 276, housingLocationPeriods: [{ locationId: "default", days: 276 }] })), getConstants(2025));
    expect(old.housingExpenseLimit.toFixed()).toBe("29491");
    expect(old.baseHousingAmount.toFixed()).toBe("15729");
  });
  it("Form2555 allocates mixed employment housing before earned income exclusion", () => {
    const base = facts();
    const result = calc({ isSelfEmployed: true, employerProvidedForeignEarnedIncome: "100000",
      partIV: { ...base.partIV, wages: "100000", businessPersonalServices: "100000" },
      incomeSources: { ...base.incomeSources, foreignEmploymentIncomeIncludedOnW2: "100000", foreignBusinessIncomeAlreadyReported: "100000" } });
    expect(result.housingExclusion.toFixed()).toBe("4368");
    expect(result.housingDeduction.toFixed()).toBe("4368");
    expect(result.foreignEarnedIncomeExclusion.toFixed()).toBe("132900");
    expect(result.incomeAvailableForExclusion.toFixed()).toBe("195632");
  });
  it("Form2555 limits housing deduction after FEIE and carries current excess one year", () => {
    const base = selfEmployed();
    const result = calc({ ...base, foreignEarnedIncome: "135000", partIV: { ...base.partIV, businessPersonalServices: "135000" }, incomeSources: { ...base.incomeSources, foreignBusinessIncomeAlreadyReported: "135000" } });
    expect(result.foreignEarnedIncomeExclusion.toFixed()).toBe("132900");
    expect(result.housingDeduction.toFixed()).toBe("2100");
    expect(result.housingDeductionCarryover.toFixed()).toBe("6636");
  });
  it("Form2555 uses prior housing carryover only within remaining income limit", () => {
    const base = selfEmployed();
    const result = calc({ ...base, foreignEarnedIncome: "145000", partIV: { ...base.partIV, businessPersonalServices: "145000" }, incomeSources: { ...base.incomeSources, foreignBusinessIncomeAlreadyReported: "145000" }, priorYearHousingDeductionCarryover: "5000", priorYearHousingCarryoverTaxYear: 2025, priorYearHousingCarryoverConfirmed: true });
    expect(line(result, "48")).toBe("8736");
    expect(line(result, "49")).toBe("3364");
    expect(result.expiredPriorYearHousingCarryover.toFixed()).toBe("1636");
    expect(result.housingDeductionCarryover.toFixed()).toBe("0");
    expect(calc({ ...base, qualifiedHousingExpenses: "0", priorYearHousingDeductionCarryover: "5000", priorYearHousingCarryoverTaxYear: 2025, priorYearHousingCarryoverConfirmed: true }).housingDeduction.toFixed()).toBe("5000");
  });
  it("Form2555 uses source housing tables for moves and explicit higher-year election", () => {
    const result = calc({ housingLocationPeriods: [{ locationId: "Canada / Toronto", days: 180 }, { locationId: "default", days: 185 }] });
    expect(result.housingExpenseLimit.toFixed()).toBe("51128");
    const elected = calculateForm2555(Form2555Schema.parse(facts({ taxYear: 2025, housingLocationPeriods: [{ locationId: "Canada / Toronto", days: 365, noticeTaxYear: 2026 }] })), getConstants(2025));
    expect(elected.housingExpenseLimit.toFixed()).toBe("62700");
    expect(calc({ qualifyingDays: 10, housingLocationPeriods: [{ locationId: "Australia / Wollongong", days: 10 }] }).housingExpenseLimit.toFixed()).toBe("1231");
  });
  it("Form2555 rejects incomplete original facts after schema defaults and reparsing", () => {
    const raw = facts();
    delete (raw as Record<string, unknown>).qualifiedHousingExpenses;
    const parsed = Form2555Schema.parse(raw);
    expect(parsed.sourceFactsComplete).toBe(false);
    expect(Form2555Schema.parse(parsed).sourceFactsComplete).toBe(false);
    expect(() => calculateForm2555(parsed, FEDERAL_2026_CONSTANTS)).toThrow(/original|source/i);
    expect(() => calc({ sourceFactsComplete: false })).toThrow(/original|source/i);
  });
  it.each(["partIV", "incomeSources", "eligibilityConfirmed", "electionsValidConfirmed", "claimForeignEarnedIncomeExclusion", "claimHousingExclusionOrDeduction", "employerProvidedForeignEarnedIncome", "deductionsAllocableToExcludedIncome", "priorYearHousingDeductionCarryover", "priorYearIncomeExclusion"])("Form2555 rejects unknown required fact %s", key => {
    expect(() => calc({ [key]: undefined })).toThrow();
  });
  it("Form2555 preserves known ineligible and declined elections without guessing", () => {
    expect(calc({ eligibilityConfirmed: false }).totalIncomeReduction.toFixed()).toBe("0");
    expect(calc({ eligibilityConfirmed: false }).housingDeduction.toFixed()).toBe("0");
    expect(calc({ claimForeignEarnedIncomeExclusion: false }).foreignEarnedIncomeExclusion.toFixed()).toBe("0");
    expect(calc({ claimHousingExclusionOrDeduction: false }).housingExclusion.toFixed()).toBe("0");
    expect(calc({ claimHousingExclusionOrDeduction: false }).totalIncomeReduction.toFixed()).toBe("132900");
  });
  it("Form2555 rejects contradictory sources stale years and arbitrary location overrides", () => {
    for (const override of [{ foreignEarnedIncome: "200001" }, { totalDaysInYear: 366 }, { qualifyingDays: 366 }, { housingExpenseLocationLimit: "100000" }, { housingLocationPeriods: [{ locationId: "Unknown", days: 365 }] }, { housingLocationPeriods: [{ locationId: "default", days: 366 }] }, { housingLocationPeriods: [{ locationId: "Canada / Toronto", days: 365, noticeTaxYear: 2027 }] }, { employerProvidedForeignEarnedIncome: "200001" }, { deductionsAllocableToExcludedIncome: "200000" }, { priorYearHousingDeductionCarryover: "100", priorYearHousingCarryoverTaxYear: 2024, priorYearHousingCarryoverConfirmed: true }, { qualifiedHousingExpenses: "-1" }, { priorYearIncomeExclusion: "5" }]) expect(() => calc(override)).toThrow();
    expect(() => calculateForm2555(Form2555Schema.parse(facts()), getConstants(2025))).toThrow(/year|constants/i);
  });
  it("Form2555 zero income has finite ratios and zero benefits", () => {
    const base = facts();
    const result = calc({ foreignEarnedIncome: "0", employerProvidedForeignEarnedIncome: "0", partIV: { ...base.partIV, wages: "0" }, incomeSources: { ...base.incomeSources, foreignEmploymentIncomeIncludedOnW2: "0" } });
    expect(line(result, "35")).toBe("0");
    expect(result.housingExclusion.toFixed()).toBe("0");
    expect(result.totalIncomeReduction.toFixed()).toBe("0");
  });
  it("Form2555 distinguishes ineligible current housing from valid preceding-year carryover", () => {
    const result = calc({ ...selfEmployed(), housingExpensesQualificationConfirmed: false, priorYearHousingDeductionCarryover: "5000", priorYearHousingCarryoverTaxYear: 2025, priorYearHousingCarryoverConfirmed: true });
    expect(result.housingAmount.toFixed()).toBe("0");
    expect(result.housingDeduction.toFixed()).toBe("5000");
    expect(result.housingDeductionCarryover.toFixed()).toBe("0");
  });
  it("Form2555 prior-year income uses a confirmed separate statement and cannot invent the exclusion", () => {
    const statement = { priorYearIncomeExclusion: "4000", priorYearIncomeExclusionTaxYear: 2025, priorYearIncomeStatementConfirmed: true, priorYearIncomeAlreadyReportedConfirmed: true, priorYearIncomeReceived: "5000", priorYearUnusedExclusion: "4000" };
    const base = calc();
    const result = calc(statement);
    expect(result.foreignEarnedIncome.eq(base.foreignEarnedIncome)).toBe(true);
    expect(result.netExclusion.minus(base.netExclusion).toFixed()).toBe("4000");
    expect(() => calc({ ...statement, priorYearUnusedExclusion: "3999" })).toThrow(/reconcile/);
    expect(() => calc({ ...statement, priorYearIncomeExclusionTaxYear: 2024 })).toThrow(/preceding-year/);
  });
  it("Form2555 notice elections require actual previous labels when locations are regrouped", () => {
    const period = { locationId: "Australia / Melbourne", days: 365, noticeTaxYear: 2026 };
    const calculate = (overrides: Record<string, unknown>) => calculateForm2555(Form2555Schema.parse(facts({ taxYear: 2025, ...overrides })), getConstants(2025));
    expect(() => calculate({ housingLocationPeriods: [period] })).toThrow(/prior-year location/);
    expect(calculate({ housingLocationPeriods: [{ ...period, priorYearLocationId: "default" }] }).housingExpenseLimit.toFixed()).toBe("40600");
    expect(() => calculate({ housingLocationPeriods: [{ locationId: "Canada / Toronto", days: 365, noticeTaxYear: 2026, priorYearLocationId: "China / Hong Kong" }] })).toThrow(/higher housing limit/);
  });
  it("Form2555 all-SE income can elect housing without electing the earned income exclusion", () => {
    const result = calc({ ...selfEmployed(), claimForeignEarnedIncomeExclusion: false });
    expect(result.totalExclusion.toFixed()).toBe("0");
    expect(result.housingDeduction.toFixed()).toBe("8736");
    expect(result.foreignEarnedIncomeTaxWorksheetAmount.toFixed()).toBe("8736");
  });

  it("Form2555 adds individually rounded location worksheet amounts", () => {
    const result = calc({ housingLocationPeriods: [{ locationId: "Canada / Toronto", days: 3 }, { locationId: "default", days: 362 }] });
    // Each official location worksheet:515.34->515 and39541.26->39541.
    expect(result.housingExpenseLimit.toFixed()).toBe("40056");
  });

});
