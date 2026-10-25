// Spec: spec/federal/indexed-2026.yaml — complete-data-pack
import { describe, expect, it } from "vitest";
import Decimal from "decimal.js";
import { FEDERAL_2026_CONSTANTS } from "@/models/federal-2026-indexed.js";
import { getConstants } from "@/models/constants.js";
import { calculateSALTLimit } from "@/utils/tax-math.js";
const d = (x: string) => new Decimal(x);
describe("Independent 2026 constant data", () => {
  it.each([
    ["saltCap", "40400"], ["saltPhaseDown.magiThreshold", "505000"],
    ["childTaxCredit.perChild", "2200"], ["childTaxCredit.refundablePerChild", "1700"],
    ["qbi.simplifiedThreshold.single", "201750"], ["qbi.simplifiedThreshold.married_filing_jointly", "403500"],
    ["qbi.simplifiedThreshold.married_filing_separately", "201775"], ["qbi.phaseInRange.single", "75000"], ["qbi.phaseInRange.married_filing_jointly", "150000"],
    ["qbi.minimumDeduction", "400"], ["qbi.minimumActiveIncome", "1000"],
    ["studentLoanInterest.phaseOutStart.married_filing_jointly", "175000"], ["studentLoanInterestDeduction.phaseOutEnd.married_filing_jointly", "205000"],
    ["hsa.selfOnlyContributionLimit", "4400"], ["hsa.familyContributionLimit", "8750"],
    ["iraDeduction.contributionLimit", "7500"], ["iraDeduction.catchUpContribution", "1100"],
    ["iraDeduction.activeParticipantPhaseOutStart.single", "81000"], ["iraDeduction.activeParticipantPhaseOutStart.married_filing_jointly", "129000"],
    ["iraDeduction.spouseActiveParticipantPhaseOutStart", "242000"], ["qcd.annualLimit", "111000"],
    ["householdEmployment.cashWageThreshold", "3000"], ["householdEmployment.socialSecurityWageBase", "184500"],
    ["foreignEarnedIncomeExclusion.maximumExclusion", "132900"], ["adoptionCredit.maxCreditPerChild", "17670"],
    ["adoptionCredit.phaseOutThreshold", "265080"], ["adoptionCredit.refundablePerChild", "5120"],
    ["excessBusinessLoss.threshold.single", "256000"], ["excessBusinessLoss.threshold.married_filing_jointly", "512000"],
    ["longTermCarePremiumLimits.age40OrUnder", "500"], ["longTermCarePremiumLimits.age41to50", "930"],
    ["longTermCarePremiumLimits.age51to60", "1860"], ["longTermCarePremiumLimits.age61to70", "4960"], ["longTermCarePremiumLimits.age71OrOlder", "6200"],
  ])("records %s = %s from official 2026 tables", (path, expected) => {
    const actual = path.split(".").reduce((v, key) => (v as Record<string, unknown>)[key], FEDERAL_2026_CONSTANTS as unknown) as Decimal;
    expect(actual.toString()).toBe(expected);
  });
  it.each([
    ["single", "504999", "40400"], ["single", "505000", "40400"],
    ["single", "505010", "40397"], ["single", "606333.33", "10000"],
    ["married_filing_separately", "252500", "20200"], ["married_filing_separately", "262500", "18700"],
  ] as const)("calculates SALT cap for %s at %s", (status, magi, expected) => {
    expect(calculateSALTLimit(d(magi), status, FEDERAL_2026_CONSTANTS).toString()).toBe(expected);
  });
  it("contains every federal constant family without any historical mutable aliases", () => {
    expect(Object.keys(getConstants(2025)).filter(k => k !== "state").every(k => k in FEDERAL_2026_CONSTANTS)).toBe(true);
    expect(FEDERAL_2026_CONSTANTS.state).toBeUndefined();
    const check = (current: unknown, old: unknown) => {
      if (!current || typeof current !== "object") return;
      expect(Object.isFrozen(current)).toBe(true);
      expect(current).not.toBe(old);
      if (Decimal.isDecimal(current)) return;
      for (const [key, child] of Object.entries(current)) check(child, (old as Record<string, unknown> | undefined)?.[key]);
    };
    check(FEDERAL_2026_CONSTANTS, getConstants(2025));
    expect(() => getConstants(2026)).toThrow(/incomplete/);
  });
});
