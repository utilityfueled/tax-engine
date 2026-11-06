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

/**
 * Complete federal constant shape declared independently of historical years.
 * This supplies isolated form tests; getConstants(2026) remains blocked until
 * every affected rule and scenario is implemented and reviewed separately.
 */
export const FEDERAL_2026_CONSTANTS: YearConstants & {
  childTaxCredit: YearConstants["childTaxCredit"] & { refundablePerChild: Decimal };
  adoptionCredit: YearConstants["adoptionCredit"] & { refundablePerChild: Decimal };
  qbi: YearConstants["qbi"] & { minimumDeduction: Decimal; minimumActiveIncome: Decimal };
} = freezeRuleData({
  taxYear: 2026,
  ...FEDERAL_2026_INDEXED,
  saltCap: d("40400"),
  saltPhaseDown: { magiThreshold: d("505000"), minimumCap: d("10000"), rate: d("0.30") },
  childTaxCredit: {
    perChild: d("2200"), refundablePerChild: d("1700"), otherDependentCredit: d("500"),
    phaseOutThreshold: { ...statuses("200000", "400000", "200000", "200000"), qualifying_surviving_spouse: d("200000") },
    phaseOutRate: d("50"),
  },
  additionalMedicareTax: {
    rate: d("0.009"),
    threshold: { ...statuses("200000", "250000", "125000", "200000"), qualifying_surviving_spouse: d("200000") },
  },
  niit: { rate: d("0.038"), threshold: statuses("200000", "250000", "125000", "200000") },
  mortgageInterest: { debtLimit: d("750000") },
  capitalLossLimit: d("3000"),
  estimatedTaxSafeHarbor: d("1.1"),
  qbi: {
    minimumDeduction: d("400"), minimumActiveIncome: d("1000"),
    simplifiedThreshold: { ...statuses("201750", "403500", "201775", "201750"), qualifying_surviving_spouse: d("201750") },
    phaseInRange: { ...statuses("75000", "150000", "75000", "75000"), qualifying_surviving_spouse: d("75000") },
  },
  studentLoanInterest: {
    maxDeduction: d("2500"),
    phaseOutStart: { ...statuses("85000", "175000", "0", "85000"), qualifying_surviving_spouse: d("85000") },
    phaseOutRange: { ...statuses("15000", "30000", "0", "15000"), qualifying_surviving_spouse: d("15000") },
  },
  studentLoanInterestDeduction: {
    phaseOutStart: { ...statuses("85000", "175000", "0", "85000"), qualifying_surviving_spouse: d("85000") },
    phaseOutEnd: { ...statuses("100000", "205000", "0", "100000"), qualifying_surviving_spouse: d("100000") },
  },
  hsa: { selfOnlyContributionLimit: d("4400"), familyContributionLimit: d("8750"), catchUpContribution: d("1000") },
  iraDeduction: {
    contributionLimit: d("7500"), catchUpContribution: d("1100"),
    activeParticipantPhaseOutStart: statuses("81000", "129000", "0", "81000"),
    activeParticipantPhaseOutRange: statuses("10000", "20000", "10000", "10000"),
    spouseActiveParticipantPhaseOutStart: d("242000"), spouseActiveParticipantPhaseOutRange: d("10000"),
  },
  cleanVehicleCredit: {
    newVehicle: {
      criticalMineralsCredit: d("3750"), batteryComponentsCredit: d("3750"),
      msrpLimitSuvVanPickup: d("80000"), msrpLimitOther: d("55000"),
      magiLimit: statuses("150000", "300000", "150000", "225000"),
    },
    previouslyOwned: {
      maxCredit: d("4000"), creditRate: d("0.30"), maxSalePrice: d("25000"),
      magiLimit: statuses("75000", "150000", "75000", "112500"),
    },
  },
  householdEmployment: {
    cashWageThreshold: d("3000"), socialSecurityRate: d("0.124"), medicareRate: d("0.029"),
    additionalMedicareRate: d("0.009"), additionalMedicareThreshold: d("200000"),
    socialSecurityWageBase: d("184500"), futaGrossRate: d("0.06"), futaMaxCredit: d("0.054"),
    futaNetRate: d("0.006"), futaWageBase: d("7000"), futaQuarterlyThreshold: d("1000"),
  },
  foreignEarnedIncomeExclusion: { maximumExclusion: d("132900"), baseHousingPercentage: d("0.16"), defaultMaxHousingPercentage: d("0.30") },
  kiddieTax: { unearnedIncomeThreshold: d("2700"), itemizingThreshold: d("1350") },
  form8814: { baseAmount: d("2700"), amountNotTaxed: d("1350"), maximumChildIncome: d("13500"), taxRate: d("0.10") },
  adoptionCredit: { maxCreditPerChild: d("17670"), phaseOutThreshold: d("265080"), phaseOutRange: d("40000"), refundablePerChild: d("5120") },
  excessBusinessLoss: { threshold: { ...statuses("256000", "512000", "256000", "256000"), qualifying_surviving_spouse: d("256000") } },
  qualifiedPrincipalResidenceExclusion: { maxExclusion: d("750000"), maxExclusionMFS: d("375000") },
  homeSaleExclusion: { maxExclusionSingle: d("250000"), maxExclusionMFJ: d("500000") },
  qcd: { annualLimit: d("111000") },
  longTermCarePremiumLimits: { age40OrUnder: d("500"), age41to50: d("930"), age51to60: d("1860"), age61to70: d("4960"), age71OrOlder: d("6200") },
  elderlyOrDisabledCredit: {
    initialAmountSingle: d("5000"), initialAmountBoth: d("7500"), initialAmountMFS: d("3750"),
    agiThreshold: { ...statuses("7500", "10000", "5000", "7500"), qualifying_surviving_spouse: d("7500") },
    creditRate: d("0.15"),
  },
});
