/** Form2555, calendar2025/2026. Spec: spec/federal/form-2555.yaml. */
import Decimal from "decimal.js";
import type { Form2555Input } from "@/models/inputs.js";
import type { YearConstants } from "@/models/constants.js";
import type { CalculatedLine } from "@/models/outputs.js";
import { AuditTrail } from "@/utils/audit.js";
import { d, zeroFloor, min, roundDollar, sum } from "@/utils/decimal.js";
import { FORM2555_HOUSING_LIMITS } from "./form-2555-housing-limits.js";

export interface Form2555Result {
  taxYear: number;
  sourceFactsVerified: boolean;
  foreignEarnedIncome: Decimal;
  maximumExclusion: Decimal;
  proratedMaximumExclusion: Decimal;
  baseHousingAmount: Decimal;
  qualifiedHousingExpensesCapped: Decimal;
  housingExpenseLimit: Decimal;
  housingAmount: Decimal;
  housingExclusion: Decimal;
  housingDeduction: Decimal;
  housingDeductionCarryover: Decimal;
  expiredPriorYearHousingCarryover: Decimal;
  incomeAvailableForExclusion: Decimal;
  foreignEarnedIncomeExclusion: Decimal;
  /** Gross current-year exclusions, official43. Not a universal MAGI addback. */
  totalExclusion: Decimal;
  /** Official45: gross exclusions less disallowed AGI deductions plus actual prior-year statement. */
  netExclusion: Decimal;
  /** Stable alias of45. Report as negative Schedule1line8d, preserving gross wages. */
  totalIncomeReduction: Decimal;
  /** Official45+50 before1040 FEI worksheet2b itemized deduction adjustment. */
  foreignEarnedIncomeTaxWorksheetAmount: Decimal;
  lines: CalculatedLine[];
}

const PART_IV = {
  wages: "19", businessPersonalServices: "20a", partnershipPersonalServices: "20b",
  noncashLodging: "21a", noncashMeals: "21b", noncashCar: "21c", noncashOther: "21d",
  allowanceCostOfLiving: "22a", allowanceFamily: "22b", allowanceEducation: "22c",
  allowanceHomeLeave: "22d", allowanceQuarters: "22e", allowanceOther: "22f",
  otherEarnedIncome: "23", section119MealsAndLodging: "25",
} as const;

function amount(value: string | undefined, name: string, required = true): Decimal {
  if (value === undefined && required) throw new Error(`Form2555 requires actual ${name}`);
  const result = d(value ?? "0");
  if (!result.isFinite() || result.isNegative()) throw new Error(`Form2555 ${name} must be finite and nonnegative`);
  return roundDollar(result);
}

function housingLimit(input: Form2555Input, year: 2025 | 2026): Decimal {
  const defaults = year === 2025 ? { annual: "39000", daily: "106.85" } : { annual: "39870", daily: "109.23" };
  const periods = input.housingLocationPeriods;
  if (!periods) {
    if (input.housingExpenseLocationLimit !== undefined) throw new Error("Form2555 arbitrary housing limit requires actual notice location periods");
    return input.qualifyingDays === 365 ? d(defaults.annual) : roundDollar(d(defaults.daily).times(input.qualifyingDays));
  }
  if (periods.length === 0 && d(input.qualifiedHousingExpenses ?? "0").gt(0)) throw new Error("Form2555 requires actual housing location periods");
  let days = 0;
  let result = d(0);
  for (const period of periods) {
    if (!Number.isInteger(period.days) || period.days < 1) throw new Error("Form2555 housing days must be positive integers");
    days += period.days;
    const noticeYear = period.noticeTaxYear ?? year;
    if (noticeYear !== year && !(year === 2025 && noticeYear === 2026)) throw new Error("Form2555 housing notice year is unavailable or mismatched");
    const entry = period.locationId === "default" ? defaults
      : FORM2555_HOUSING_LIMITS[noticeYear as 2025 | 2026].find(row => row.id === period.locationId);
    if (!entry || (period.locationId === "default" && noticeYear !== year)) throw new Error("Form2555 housing location must match the selected official notice");
    const limit = period.days === 365 ? d(entry.annual) : d(entry.daily).times(period.days);
    if (noticeYear !== year) {
      const priorId = period.priorYearLocationId ?? period.locationId;
      const prior = priorId === "default" ? defaults : FORM2555_HOUSING_LIMITS[year].find(row => row.id === priorId);
      if (!prior) throw new Error("Form2555 higher-year election requires actual prior-year location when the notice label changed");
      const priorLimit = period.days === 365 ? d(prior.annual) : d(prior.daily).times(period.days);
      if (limit.lt(priorLimit)) throw new Error("Form2555 subsequent-year election must use a higher housing limit");
    }
    result = result.plus(roundDollar(limit));
  }
  if (days > input.qualifyingDays) throw new Error("Form2555 housing location days exceed qualifying days");
  result = roundDollar(result);
  if (input.housingExpenseLocationLimit !== undefined && !amount(input.housingExpenseLocationLimit, "legacy housing limit").eq(result)) throw new Error("Form2555 legacy housing limit does not reconcile to the notice");
  return result;
}

export function calculateForm2555(input: Form2555Input, constants: YearConstants): Form2555Result {
  const taxYear = input.taxYear ?? 2025;
  if (taxYear !== 2025 && taxYear !== 2026) throw new Error("Form2555 supports calendar tax years2025 and2026 only");
  const maximumExclusion = d(taxYear === 2025 ? "130000" : "132900");
  if (!constants.foreignEarnedIncomeExclusion.maximumExclusion.eq(maximumExclusion)) throw new Error("Form2555 constants do not match tax year");
  if (input.totalDaysInYear !== 365 || !Number.isInteger(input.qualifyingDays) || input.qualifyingDays < 0 || input.qualifyingDays > 365) throw new Error("Form2555 qualifying days must match the actual calendar year");
  const verified = input.sourceFactsConfirmed === true;
  const strict = taxYear === 2026 || verified;
  if (strict && (!verified || input.sourceFactsComplete === false)) throw new Error("Form2555 requires complete original source facts and confirmation");
  if (strict) {
    for (const key of ["eligibilityConfirmed", "electionsValidConfirmed", "claimForeignEarnedIncomeExclusion", "claimHousingExclusionOrDeduction", "housingExpensesQualificationConfirmed"] as const) {
      if (typeof input[key] !== "boolean") throw new Error(`Form2555 requires actual ${key}`);
    }
    if (!input.partIV || !input.incomeSources || input.incomeSourceMappingConfirmed !== true) throw new Error("Form2555 requires actual PartIV and confirmed income source mapping");
  }
  const audit = new AuditTrail();
  const record = (line: string, label: string, value: Decimal, formula: string) => audit.record("2555", line, label, value, formula);
  const foreignEarnedIncome = amount(input.foreignEarnedIncome, "foreign earned income");
  if (input.partIV) {
    const partIV = input.partIV;
    const values = Object.fromEntries(Object.entries(PART_IV).map(([key, line]) => {
      const value = amount(partIV[key as keyof typeof PART_IV], `PartIV ${key}`);
      record(line, key, value, "Actual eligible source amount in USD");
      return [key, value];
    })) as Record<keyof typeof PART_IV, Decimal>;
    const allowances = sum(...Object.keys(PART_IV).filter(key => key.startsWith("allowance")).map(key => values[key as keyof typeof PART_IV]));
    const receipts = sum(...Object.keys(PART_IV).filter(key => key !== "section119MealsAndLodging").map(key => values[key as keyof typeof PART_IV]));
    const section119 = values.section119MealsAndLodging;
    if (section119.gt(values.noncashMeals.plus(values.noncashLodging))) throw new Error("Form2555 section119 meals and lodging exceed actual noncash source amounts");
    if (!receipts.minus(section119).eq(foreignEarnedIncome)) throw new Error("Form2555 PartIV does not reconcile to foreign earned income");
    record("22g", "Total allowances", allowances, "sum22a..22f");
    record("24", "Gross current-year foreign earned receipts", receipts, "19+20a+20b+21a..21d+22g+23");
  }
  record("26", "Current-year foreign earned income", foreignEarnedIncome, input.partIV ? "24-25" : "Legacy aggregate; detailed source lines unverified");
  record("27", "Foreign earned income", foreignEarnedIncome, "26");
  let employmentSources: Decimal | undefined;
  if (input.incomeSources) {
    const mapped = Object.fromEntries(Object.entries(input.incomeSources).map(([key, value]) => [key, amount(value, key)])) as Record<keyof NonNullable<Form2555Input["incomeSources"]>, Decimal>;
    if (!sum(...Object.values(mapped)).eq(foreignEarnedIncome)) throw new Error("Form2555 income source mapping does not reconcile to line26");
    employmentSources = mapped.foreignEmploymentIncomeIncludedOnW2.plus(mapped.foreignEmploymentIncomeNotOnW2);
    if (!input.isSelfEmployed && mapped.foreignBusinessIncomeAlreadyReported.plus(mapped.foreignPartnershipIncomeAlreadyReported).gt(0)) throw new Error("Form2555 business source contradicts self-employment classification");
  }
  const eligible = input.eligibilityConfirmed !== false && input.electionsValidConfirmed !== false && input.qualifyingDays > 0;
  const claimHousing = eligible && input.claimHousingExclusionOrDeduction !== false;
  const claimFEIE = eligible && input.claimForeignEarnedIncomeExclusion !== false;
  const rawExpenses = amount(input.qualifiedHousingExpenses, "qualified housing expenses", strict);
  // Published daily factors intentionally differ from annual/365 fractions.
  const baseHousingAmount = input.qualifyingDays === 365 ? d(taxYear === 2025 ? "20800" : "21264")
    : roundDollar(d(taxYear === 2025 ? "56.99" : "58.26").times(input.qualifyingDays));
  if (strict && rawExpenses.gt(0) && !input.housingLocationPeriods) throw new Error("Form2555 requires actual housing location periods");
  const housingExpenseLimit = housingLimit(input, taxYear);
  const qualifiedHousingExpensesCapped = min(rawExpenses, housingExpenseLimit);
  const housingAmount = claimHousing && input.housingExpensesQualificationConfirmed !== false ? zeroFloor(qualifiedHousingExpensesCapped.minus(baseHousingAmount)) : d(0);
  const employerProvided = amount(input.employerProvidedForeignEarnedIncome, "employer-provided foreign earned income", strict || housingAmount.gt(0));
  if (employerProvided.gt(foreignEarnedIncome) || (employmentSources !== undefined && !employmentSources.eq(employerProvided))) throw new Error("Form2555 employer-provided income does not reconcile to eligible employment sources");
  if (!input.isSelfEmployed && housingAmount.gt(0) && !employerProvided.eq(foreignEarnedIncome)) throw new Error("Form2555 mixed housing allocation requires actual self-employment classification");
  const employerFraction = foreignEarnedIncome.isZero() ? d(0) : min(d(1), employerProvided.div(foreignEarnedIncome)).toDecimalPlaces(12);
  const housingExclusion = min(employerProvided, roundDollar(housingAmount.times(employerFraction)));
  record("28", "Qualified housing expenses", rawExpenses, "Actual eligible expenses");
  record("29b", "Housing expense limit", housingExpenseLimit, "Published annual or sum of published daily notice limits");
  record("30", "Capped housing expenses", qualifiedHousingExpensesCapped, "min28,29b");
  record("31", "Qualifying housing days", d(input.qualifyingDays), "Actual days in calendar tax year");
  record("32", "Base housing amount", baseHousingAmount, "Published full-year base or daily base times qualifying days");
  record("33", "Housing amount", housingAmount, "max(0,30-32) if eligible and housing elected");
  record("34", "Employer-provided foreign earned income", employerProvided, "All employer-provided eligible foreign income; not housing reimbursement alone");
  record("35", "Employer-provided fraction", employerFraction, "min(1,34/27), twelve decimal places");
  record("36", "Housing exclusion", housingExclusion, "min(34,round33*35)");
  const fraction = d(input.qualifyingDays).div(365).toDecimalPlaces(12);
  const proratedMaximumExclusion = roundDollar(maximumExclusion.times(fraction));
  const incomeAvailableForExclusion = zeroFloor(foreignEarnedIncome.minus(housingExclusion));
  const foreignEarnedIncomeExclusion = claimFEIE ? min(incomeAvailableForExclusion, proratedMaximumExclusion) : d(0);
  const totalExclusion = foreignEarnedIncomeExclusion.plus(housingExclusion);
  const allocableDeductions = amount(input.deductionsAllocableToExcludedIncome, "deductions allocable to excluded income", strict);
  if (eligible && allocableDeductions.gt(totalExclusion)) throw new Error("Form2555 allocable deductions exceed the actual exclusions");
  const priorIncome = amount(input.priorYearIncomeExclusion, "prior-year income exclusion", strict);
  if (priorIncome.gt(0)) {
    if (input.priorYearIncomeExclusionTaxYear !== taxYear - 1 || input.priorYearIncomeStatementConfirmed !== true || input.priorYearIncomeAlreadyReportedConfirmed !== true) throw new Error("Form2555 prior-year income exclusion requires the actual preceding-year computation statement");
    const received = amount(input.priorYearIncomeReceived, "prior-year earned income received this year");
    const available = amount(input.priorYearUnusedExclusion, "prior-year remaining exclusion from actual recomputation");
    if (!priorIncome.eq(min(received, available))) throw new Error("Form2555 prior-year statement exclusion does not reconcile to received income and unused exclusion");
  }
  const netExclusion = eligible ? totalExclusion.minus(allocableDeductions).plus(priorIncome) : d(0);
  record("37", "Maximum foreign earned income exclusion", maximumExclusion, `Indexed limit for${taxYear}`);
  record("38", "Qualifying days", d(input.qualifyingDays), "Actual days in calendar tax year");
  record("39", "Qualifying fraction", fraction, "38/365, twelve decimal places");
  record("40", "Prorated maximum exclusion", proratedMaximumExclusion, "round37*39");
  record("41", "Income available for earned income exclusion", incomeAvailableForExclusion, "27-36; no housing deduction subtraction");
  record("42", "Foreign earned income exclusion", foreignEarnedIncomeExclusion, "min40,41 if eligible and elected");
  record("43", "Gross combined exclusions", totalExclusion, "36+42");
  record("44", "Deductions allocable to excluded income", eligible ? allocableDeductions : d(0), "Actual disallowed AGI deductions computation");
  record("45", "Net foreign income exclusion", netExclusion, "43-44 plus actual prior-year exclusion statement; negative Schedule1line8d");
  const selfEmploymentHousing = input.isSelfEmployed ? zeroFloor(housingAmount.minus(housingExclusion)) : d(0);
  const deductionLimit = zeroFloor(foreignEarnedIncome.minus(totalExclusion));
  const currentDeduction = min(selfEmploymentHousing, deductionLimit);
  const priorCarry = amount(input.priorYearHousingDeductionCarryover, "prior-year housing deduction carryover", strict);
  if (priorCarry.gt(0) && (input.priorYearHousingCarryoverTaxYear !== taxYear - 1 || input.priorYearHousingCarryoverConfirmed !== true)) throw new Error("Form2555 housing carryover requires confirmed immediately preceding-year source");
  // IRC911(c)(4)(C) / Pub54 allow carryover to use remaining income room even if current housing is zero.
  const carryUsed = claimHousing ? min(priorCarry, zeroFloor(deductionLimit.minus(currentDeduction))) : d(0);
  const housingDeduction = currentDeduction.plus(carryUsed);
  const housingDeductionCarryover = zeroFloor(selfEmploymentHousing.minus(currentDeduction));
  const expiredPriorYearHousingCarryover = priorCarry.minus(carryUsed);
  record("46", "Self-employment housing amount", selfEmploymentHousing, "max(0,33-36) attributable to self-employment");
  record("47", "Housing deduction income limit", deductionLimit, "max(0,27-43)");
  record("48", "Current-year housing deduction", currentDeduction, "min46,47");
  record("49", "Prior-year housing deduction carryover used", carryUsed, "min(confirmed prior-year carryover,47-48)");
  record("50", "Total housing deduction", housingDeduction, "48+49; Schedule1line24j");
  record("carryover", "Housing deduction carried to next year only", housingDeductionCarryover, "max(0,46-48); prior carry never carries again");
  return { taxYear, sourceFactsVerified: verified, foreignEarnedIncome, maximumExclusion, proratedMaximumExclusion,
    baseHousingAmount, qualifiedHousingExpensesCapped, housingExpenseLimit, housingAmount, housingExclusion,
    housingDeduction, housingDeductionCarryover, expiredPriorYearHousingCarryover, incomeAvailableForExclusion,
    foreignEarnedIncomeExclusion, totalExclusion, netExclusion, totalIncomeReduction: netExclusion,
    foreignEarnedIncomeTaxWorksheetAmount: netExclusion.plus(housingDeduction), lines: audit.getLines() };
}
