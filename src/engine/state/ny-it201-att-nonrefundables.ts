/**
 * New York IT-201-ATT Part 1 Sections A through C nonrefundable credits.
 * Computes line 7 and line 10, which flow to Form IT-201 lines 42 and 53.
 * Spec: spec/state/ny-it201-att-nonrefundables.yaml
 */

import Decimal from "decimal.js";
import type { CalculatedLine } from "@/models/outputs.js";
import { AuditTrail } from "@/utils/audit.js";
import { d, sum } from "@/utils/decimal.js";

export interface NYIT201ATTNonrefundableCreditEntry {
  code: string;
  amount: Decimal | string | number;
}

export interface NYIT201ATTNonrefundableCreditsInput {
  taxYear: number;
  accumulationDistributionCredit?: Decimal | string | number;
  otherNoncarryoverCredits?: Decimal | string | number;
  otherNoncarryoverCreditEntries?: NYIT201ATTNonrefundableCreditEntry[];
  longTermCareInsuranceCredit?: Decimal | string | number;
  investmentCredit?: Decimal | string | number;
  solarEnergySystemEquipmentCredit?: Decimal | string | number;
  otherCarryoverCredits?: Decimal | string | number;
  otherCarryoverCreditEntries?: NYIT201ATTNonrefundableCreditEntry[];
  nycResidentUbtCredit?: Decimal | string | number;
  nycAccumulationDistributionCredit?: Decimal | string | number;
  partYearNYCChildAndDependentCareCredit?: Decimal | string | number;
}

export interface NYIT201ATTNonrefundableCreditsResult {
  accumulationDistributionCredit: Decimal;
  otherNoncarryoverCredits: Decimal;
  longTermCareInsuranceCredit: Decimal;
  investmentCredit: Decimal;
  solarEnergySystemEquipmentCredit: Decimal;
  otherCarryoverCredits: Decimal;
  totalNYStateNonrefundableCredits: Decimal;
  nycResidentUbtCredit: Decimal;
  nycAccumulationDistributionCredit: Decimal;
  partYearNYCChildAndDependentCareCredit: Decimal;
  totalNYCNonrefundableCredits: Decimal;
  lines: CalculatedLine[];
}

const MAX_NONCARRYOVER_CREDIT_ENTRIES = 2;
const MAX_CARRYOVER_CREDIT_ENTRIES = 14;

function sumDetailedCredits(
  entries: NYIT201ATTNonrefundableCreditEntry[],
  maxEntries: number,
  lineNumber: string,
  description: string
): Decimal {
  if (entries.length > maxEntries) {
    throw new Error(
      `NY IT-201-ATT line ${lineNumber} supports at most ${maxEntries} coded ${description} entries`
    );
  }

  return entries.reduce((total, entry, index) => {
    if (!entry.code.trim()) {
      throw new Error(
        `NY IT-201-ATT line ${lineNumber}${String.fromCharCode(97 + index)} code is required`
      );
    }
    return total.plus(d(entry.amount));
  }, new Decimal(0));
}

export function calculateNYIT201ATTNonrefundableCredits(
  input: NYIT201ATTNonrefundableCreditsInput
): NYIT201ATTNonrefundableCreditsResult {
  if (input.taxYear !== 2025) {
    throw new Error(
      `NY IT-201-ATT nonrefundable credits not available for tax year ${input.taxYear}`
    );
  }

  const audit = new AuditTrail();

  const accumulationDistributionCredit = d(input.accumulationDistributionCredit);
  audit.record(
    "NY-IT201-ATT",
    "1",
    "Accumulation distribution credit",
    accumulationDistributionCredit,
    "Passthrough amount"
  );

  const otherNoncarryoverCredits =
    input.otherNoncarryoverCreditEntries && input.otherNoncarryoverCreditEntries.length > 0
      ? sumDetailedCredits(
          input.otherNoncarryoverCreditEntries,
          MAX_NONCARRYOVER_CREDIT_ENTRIES,
          "2",
          "non-carryover credit"
        )
      : d(input.otherNoncarryoverCredits);
  audit.record(
    "NY-IT201-ATT",
    "2",
    "Other nonrefundable, non-carryover credits",
    otherNoncarryoverCredits,
    input.otherNoncarryoverCreditEntries && input.otherNoncarryoverCreditEntries.length > 0
      ? "Sum of coded line 2 entries"
      : "Direct line 2 passthrough"
  );

  const longTermCareInsuranceCredit = d(input.longTermCareInsuranceCredit);
  audit.record(
    "NY-IT201-ATT",
    "3",
    "Long-term care insurance credit",
    longTermCareInsuranceCredit,
    "Passthrough amount"
  );

  const investmentCredit = d(input.investmentCredit);
  audit.record(
    "NY-IT201-ATT",
    "4",
    "Investment credit",
    investmentCredit,
    "Passthrough amount"
  );

  const solarEnergySystemEquipmentCredit = d(input.solarEnergySystemEquipmentCredit);
  audit.record(
    "NY-IT201-ATT",
    "5",
    "Solar energy system equipment credit",
    solarEnergySystemEquipmentCredit,
    "Passthrough amount"
  );

  const otherCarryoverCredits =
    input.otherCarryoverCreditEntries && input.otherCarryoverCreditEntries.length > 0
      ? sumDetailedCredits(
          input.otherCarryoverCreditEntries,
          MAX_CARRYOVER_CREDIT_ENTRIES,
          "6",
          "carryover credit"
        )
      : d(input.otherCarryoverCredits);
  audit.record(
    "NY-IT201-ATT",
    "6",
    "Other nonrefundable, carryover credits",
    otherCarryoverCredits,
    input.otherCarryoverCreditEntries && input.otherCarryoverCreditEntries.length > 0
      ? "Sum of coded line 6 entries"
      : "Direct line 6 passthrough"
  );

  const totalNYStateNonrefundableCredits = sum(
    accumulationDistributionCredit,
    otherNoncarryoverCredits,
    longTermCareInsuranceCredit,
    investmentCredit,
    solarEnergySystemEquipmentCredit,
    otherCarryoverCredits
  );
  audit.record(
    "NY-IT201-ATT",
    "7",
    "Total New York State nonrefundable credits used",
    totalNYStateNonrefundableCredits,
    "Line 1 + Line 2 + Line 3 + Line 4 + Line 5 + Line 6",
    {
      "Accumulation distribution credit (line 1)": accumulationDistributionCredit.toString(),
      "Other noncarryover credits (line 2)": otherNoncarryoverCredits.toString(),
      "Long-term care insurance credit (line 3)": longTermCareInsuranceCredit.toString(),
      "Investment credit (line 4)": investmentCredit.toString(),
      "Solar energy system equipment credit (line 5)": solarEnergySystemEquipmentCredit.toString(),
      "Other carryover credits (line 6)": otherCarryoverCredits.toString(),
    }
  );

  const nycResidentUbtCredit = d(input.nycResidentUbtCredit);
  audit.record(
    "NY-IT201-ATT",
    "8",
    "New York City resident UBT credit",
    nycResidentUbtCredit,
    "Passthrough amount"
  );

  const nycAccumulationDistributionCredit = d(input.nycAccumulationDistributionCredit);
  audit.record(
    "NY-IT201-ATT",
    "9",
    "New York City accumulation distribution credit",
    nycAccumulationDistributionCredit,
    "Passthrough amount"
  );

  const partYearNYCChildAndDependentCareCredit = d(input.partYearNYCChildAndDependentCareCredit);
  audit.record(
    "NY-IT201-ATT",
    "9a",
    "Part-year resident nonrefundable NYC child and dependent care credit",
    partYearNYCChildAndDependentCareCredit,
    "Passthrough amount"
  );

  const totalNYCNonrefundableCredits = sum(
    nycResidentUbtCredit,
    nycAccumulationDistributionCredit,
    partYearNYCChildAndDependentCareCredit
  );
  audit.record(
    "NY-IT201-ATT",
    "10",
    "Total other New York City nonrefundable credits used",
    totalNYCNonrefundableCredits,
    "Line 8 + Line 9 + Line 9a",
    {
      "New York City resident UBT credit (line 8)": nycResidentUbtCredit.toString(),
      "New York City accumulation distribution credit (line 9)": nycAccumulationDistributionCredit.toString(),
      "Part-year resident nonrefundable NYC child and dependent care credit (line 9a)": partYearNYCChildAndDependentCareCredit.toString(),
    }
  );

  return {
    accumulationDistributionCredit,
    otherNoncarryoverCredits,
    longTermCareInsuranceCredit,
    investmentCredit,
    solarEnergySystemEquipmentCredit,
    otherCarryoverCredits,
    totalNYStateNonrefundableCredits,
    nycResidentUbtCredit,
    nycAccumulationDistributionCredit,
    partYearNYCChildAndDependentCareCredit,
    totalNYCNonrefundableCredits,
    lines: audit.getLines(),
  };
}
