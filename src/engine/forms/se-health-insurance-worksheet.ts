/**
 * Self-Employed Health Insurance Deduction Worksheet (Pub 535)
 * Spec: spec/federal/se-health-insurance-worksheet.yaml
 *
 * Computes the above-the-line deduction under IRC §162(l) for health
 * insurance premiums paid by self-employed individuals. The result
 * flows to Schedule 1 Line 17.
 */

import Decimal from "decimal.js";
import type { SEHealthInsuranceWorksheetInput } from "@/models/inputs.js";
import type { CalculatedLine } from "@/models/outputs.js";
import type { YearConstants } from "@/models/constants.js";
import { d, min, sum, zeroFloor } from "@/utils/decimal.js";
import { AuditTrail } from "@/utils/audit.js";

const ZERO = new Decimal(0);
const TWELVE = new Decimal(12);

export interface SEHealthInsuranceWorksheetResult {
  /** Line 1: Medical, dental, and vision premiums */
  medicalDentalPremiums: Decimal;
  /** Line 2: Long-term care premiums (after age-based limits) */
  longTermCarePremiumsAllowed: Decimal;
  /** Line 3: Medicare premiums (Part B + Part D + Medigap) */
  medicarePremiums: Decimal;
  /** Line 4: Total premiums before proration */
  totalPremiums: Decimal;
  /** Line 5: Number of eligible months */
  eligibleMonths: number;
  /** Line 6: Prorated premiums */
  proratedPremiums: Decimal;
  /** Line 7: Net profit from business */
  netProfit: Decimal;
  /** Line 8: Deductible SE tax */
  deductibleSETax: Decimal;
  /** Line 9: SE retirement contributions */
  seRetirementContributions: Decimal;
  /** Line 10: Earned income limit = max(0, Line 7 - Line 8 - Line 9) */
  earnedIncomeLimit: Decimal;
  /** Line 11: Deductible amount = min(Line 6, Line 10) */
  deductibleAmount: Decimal;
  /** Excess premiums not deductible here, available for Schedule A medical */
  excessForScheduleA: Decimal;
  /** Audit trail */
  lines: CalculatedLine[];
}

/**
 * Determine the IRC §213(d)(10) long-term care premium limit based on
 * the covered person's attained age at end of the tax year.
 */
function getLongTermCarePremiumLimit(
  attainedAge: number,
  limits: YearConstants["longTermCarePremiumLimits"]
): Decimal {
  if (attainedAge <= 40) return limits.age40OrUnder;
  if (attainedAge <= 50) return limits.age41to50;
  if (attainedAge <= 60) return limits.age51to60;
  if (attainedAge <= 70) return limits.age61to70;
  return limits.age71OrOlder;
}

export function calculateSEHealthInsuranceWorksheet(
  input: SEHealthInsuranceWorksheetInput,
  constants: YearConstants
): SEHealthInsuranceWorksheetResult {
  const audit = new AuditTrail();

  // Line 1: Medical, dental, and vision premiums
  const medicalDentalPremiums = d(input.medicalDentalPremiums);
  audit.record(
    "SE Health Ins WS",
    "1",
    "Medical/dental/vision premiums",
    medicalDentalPremiums,
    "Health, dental, and vision insurance premiums paid"
  );

  // Line 2: Long-term care premiums (capped per person by age)
  let longTermCarePremiumsAllowed = ZERO;
  const ltcDetails: Record<string, Decimal | string> = {};
  const ltcCoverages = input.longTermCareCoverages ?? [];
  for (let i = 0; i < ltcCoverages.length; i++) {
    const cov = ltcCoverages[i];
    const actual = d(cov.premiumsPaid);
    const limit = getLongTermCarePremiumLimit(cov.attainedAge, constants.longTermCarePremiumLimits);
    const allowed = min(actual, limit);
    longTermCarePremiumsAllowed = longTermCarePremiumsAllowed.plus(allowed);
    ltcDetails[`Person ${i + 1} age ${cov.attainedAge} actual`] = actual;
    ltcDetails[`Person ${i + 1} age ${cov.attainedAge} limit`] = limit;
    ltcDetails[`Person ${i + 1} age ${cov.attainedAge} allowed`] = allowed;
  }
  audit.record(
    "SE Health Ins WS",
    "2",
    "Long-term care premiums (age-limited)",
    longTermCarePremiumsAllowed,
    ltcCoverages.length > 0
      ? `Sum of ${ltcCoverages.length} covered person(s), each capped at IRC §213(d)(10) age-based limit`
      : "No long-term care coverages reported",
    ltcDetails
  );

  // Line 3: Medicare premiums
  const medicarePremiums = sum(
    d(input.medicarePartBPremiums),
    d(input.medicarePartDPremiums),
    d(input.medigapPremiums)
  );
  audit.record(
    "SE Health Ins WS",
    "3",
    "Medicare premiums",
    medicarePremiums,
    "Medicare Part B + Part D + Medigap premiums (IRC §162(l)(2)(C), Rev. Rul. 2010-13)",
    {
      "Part B": d(input.medicarePartBPremiums),
      "Part D": d(input.medicarePartDPremiums),
      "Medigap": d(input.medigapPremiums),
    }
  );

  // Line 4: Total premiums
  const totalPremiums = sum(medicalDentalPremiums, longTermCarePremiumsAllowed, medicarePremiums);
  audit.record(
    "SE Health Ins WS",
    "4",
    "Total premiums before proration",
    totalPremiums,
    "Line 1 + Line 2 + Line 3"
  );

  // Line 5: Eligible months
  const eligibleMonths = input.eligibleMonths;
  audit.record(
    "SE Health Ins WS",
    "5",
    "Eligible months",
    new Decimal(eligibleMonths),
    `${eligibleMonths} month(s) not eligible for employer-subsidized coverage`
  );

  // Line 6: Prorated premiums
  const proratedPremiums = eligibleMonths >= 12
    ? totalPremiums
    : totalPremiums.times(new Decimal(eligibleMonths)).dividedBy(TWELVE).toDecimalPlaces(0, Decimal.ROUND_HALF_UP);
  audit.record(
    "SE Health Ins WS",
    "6",
    "Prorated premiums",
    proratedPremiums,
    eligibleMonths >= 12
      ? "Full year eligible — no proration"
      : `${totalPremiums} × (${eligibleMonths} / 12)`
  );

  // Line 7: Net profit
  const netProfit = d(input.netProfit);
  audit.record(
    "SE Health Ins WS",
    "7",
    "Net profit from business",
    netProfit,
    "Schedule C Line 31 or Schedule F Line 34"
  );

  // Line 8: Deductible SE tax
  const deductibleSETax = d(input.deductibleSETax);
  audit.record(
    "SE Health Ins WS",
    "8",
    "Deductible SE tax",
    deductibleSETax,
    "Deductible portion of self-employment tax attributable to this business"
  );

  // Line 9: SE retirement contributions
  const seRetirementContributions = d(input.seRetirementContributions);
  audit.record(
    "SE Health Ins WS",
    "9",
    "SE retirement contributions",
    seRetirementContributions,
    "SEP/SIMPLE/qualified plan contributions attributable to this business"
  );

  // Line 10: Earned income limit
  const earnedIncomeLimit = zeroFloor(
    netProfit.minus(deductibleSETax).minus(seRetirementContributions)
  );
  audit.record(
    "SE Health Ins WS",
    "10",
    "Earned income limit",
    earnedIncomeLimit,
    `max(0, ${netProfit} - ${deductibleSETax} - ${seRetirementContributions})`,
    {
      "Net profit": netProfit,
      "Deductible SE tax": deductibleSETax,
      "SE retirement contributions": seRetirementContributions,
    }
  );

  // Line 11: Deductible amount
  const deductibleAmount = min(proratedPremiums, earnedIncomeLimit);
  audit.record(
    "SE Health Ins WS",
    "11",
    "SE health insurance deduction",
    deductibleAmount,
    `min(prorated premiums ${proratedPremiums}, earned income limit ${earnedIncomeLimit})`,
    {
      "Prorated premiums": proratedPremiums,
      "Earned income limit": earnedIncomeLimit,
    }
  );

  // Excess for Schedule A
  const excessForScheduleA = zeroFloor(proratedPremiums.minus(deductibleAmount));
  if (excessForScheduleA.greaterThan(0)) {
    audit.record(
      "SE Health Ins WS",
      "excess",
      "Excess premiums for Schedule A",
      excessForScheduleA,
      "Prorated premiums minus deductible amount — available as medical expense on Schedule A Line 1 (subject to 7.5% AGI floor)"
    );
  }

  return {
    medicalDentalPremiums,
    longTermCarePremiumsAllowed,
    medicarePremiums,
    totalPremiums,
    eligibleMonths,
    proratedPremiums,
    netProfit,
    deductibleSETax,
    seRetirementContributions,
    earnedIncomeLimit,
    deductibleAmount,
    excessForScheduleA,
    lines: audit.getLines(),
  };
}
