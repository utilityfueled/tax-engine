/**
 * Partial, independently versioned 2026 data. Never substitute this for a full
 * YearConstants pack: getConstants(2026) remains unavailable until qualification.
 * Sources and formulas: spec/federal/indexed-2026.yaml (retrieved 2026-10-24).
 */
import Decimal from "decimal.js";
import type { FilingStatus, TaxBracket, YearConstants } from "./constants.js";
import { freezeRuleData } from "./rule-pack-metadata.js";

const d = (value: string) => new Decimal(value);
function statuses(single: string, joint: string, separate: string, head: string): Record<FilingStatus, Decimal> {
  return { single: d(single), married_filing_jointly: d(joint), married_filing_separately: d(separate), head_of_household: d(head), qualifying_surviving_spouse: d(joint) };
}
function brackets(limits: string[]): TaxBracket[] {
  const rates = ["0.10", "0.12", "0.22", "0.24", "0.32", "0.35", "0.37"];
  return rates.map((rate, index) => ({ min: d(index === 0 ? "0" : limits[index - 1]), max: index < limits.length ? d(limits[index]) : null, rate: d(rate) }));
}
const children = (zero: string, one: string, two: string, three: string): Record<number, Decimal> =>
  ({ 0: d(zero), 1: d(one), 2: d(two), 3: d(three) });

export type Federal2026Indexed = Pick<YearConstants, "standardDeduction" | "taxBrackets" | "capitalGainsRates" | "amt" | "selfEmploymentTax"> & {
  dependentStandardDeduction: { minimum: Decimal; earnedIncomeAddition: Decimal };
  additionalStandardDeduction: { unmarried: Decimal; marriedOrSurvivingSpouse: Decimal };
  eitc: YearConstants["eitc"] & {
    maximumCredit: Record<number, Decimal>;
    completedPhaseOutSingleHoH: Record<number, Decimal>;
    completedPhaseOutMFJ: Record<number, Decimal>;
  };
};

export const FEDERAL_2026_INDEXED: Federal2026Indexed = freezeRuleData({
  standardDeduction: statuses("16100", "32200", "16100", "24150"),
  dependentStandardDeduction: { minimum: d("1350"), earnedIncomeAddition: d("450") },
  additionalStandardDeduction: { unmarried: d("2050"), marriedOrSurvivingSpouse: d("1650") },
  taxBrackets: {
    single: brackets(["12400", "50400", "105700", "201775", "256225", "640600"]),
    married_filing_jointly: brackets(["24800", "100800", "211400", "403550", "512450", "768700"]),
    married_filing_separately: brackets(["12400", "50400", "105700", "201775", "256225", "384350"]),
    head_of_household: brackets(["17700", "67450", "105700", "201750", "256200", "640600"]),
    qualifying_surviving_spouse: brackets(["24800", "100800", "211400", "403550", "512450", "768700"]),
  },
  capitalGainsRates: {
    zero: { threshold: statuses("49450", "98900", "49450", "66200") },
    fifteen: { threshold: statuses("545500", "613700", "306850", "579600") },
    twenty: {},
  },
  amt: {
    exemption: statuses("90100", "140200", "70100", "90100"),
    phaseOutThreshold: statuses("500000", "1000000", "500000", "500000"),
    phaseOutRate: d("0.50"),
    rate26Limit: statuses("244500", "244500", "122250", "244500"),
  },
  selfEmploymentTax: {
    socialSecurityRate: d("0.124"), medicareRate: d("0.029"),
    socialSecurityWageBase: d("184500"), earningsMultiplier: d("0.9235"), deductiblePortion: d("0.5"),
  },
  eitc: {
    investmentIncomeLimit: d("12200"),
    creditRate: children("0.0765", "0.34", "0.40", "0.45"),
    phaseOutRate: children("0.0765", "0.1598", "0.2106", "0.2106"),
    earnedIncomeAmount: children("8680", "13020", "18290", "18290"),
    phaseOutStartSingleHoH: children("10860", "23890", "23890", "23890"),
    phaseOutStartMFJ: children("18140", "31160", "31160", "31160"),
    maximumCredit: children("664", "4427", "7316", "8231"),
    completedPhaseOutSingleHoH: children("19540", "51593", "58629", "62974"),
    completedPhaseOutMFJ: children("26820", "58863", "65899", "70244"),
  },
});
