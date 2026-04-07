/**
 * Pennsylvania Schedule O — Other Deductions
 * Spec: spec/state/pa-schedule-o.yaml
 */

import Decimal from "decimal.js";
import { AuditTrail } from "@/utils/audit.js";
import { min, roundDollar, sum, zeroFloor } from "@/utils/decimal.js";
import type { CalculatedLine } from "@/models/outputs.js";

interface PAScheduleOConstants {
  section529ContributionLimit: Decimal;
  ableAnnualExclusion: Decimal;
  studentLoanInterestCap: Decimal;
}

const PA_SCHEDULE_O_CONSTANTS: Record<number, PAScheduleOConstants> = {
  2024: {
    section529ContributionLimit: new Decimal(18000),
    ableAnnualExclusion: new Decimal(18000),
    studentLoanInterestCap: new Decimal(0),
  },
  2025: {
    section529ContributionLimit: new Decimal(19000),
    ableAnnualExclusion: new Decimal(19000),
    studentLoanInterestCap: new Decimal(2500),
  },
  2026: {
    section529ContributionLimit: new Decimal(19000),
    ableAnnualExclusion: new Decimal(19000),
    studentLoanInterestCap: new Decimal(2500),
  },
};

export interface PAScheduleOContributionEntry {
  beneficiaryName: string;
  beneficiarySSN: string;
  taxpayerContribution?: Decimal;
  spouseContribution?: Decimal;
}

export interface PAScheduleOInput {
  taxYear: number;
  qualifiedTuitionContributions?: PAScheduleOContributionEntry[];
  ableContributions?: PAScheduleOContributionEntry[];
  medicalSavingsAccountDeduction?: Decimal;
  spouseMedicalSavingsAccountDeduction?: Decimal;
  healthSavingsAccountDeduction?: Decimal;
  spouseHealthSavingsAccountDeduction?: Decimal;
  studentLoanInterestDeduction?: Decimal;
  spouseStudentLoanInterestDeduction?: Decimal;
  taxpayerPATaxableIncome: Decimal;
  spousePATaxableIncome?: Decimal;
}

export interface PAScheduleOResult {
  qualifiedTuitionContributions: Array<Required<PAScheduleOContributionEntry>>;
  ableContributions: Array<Required<PAScheduleOContributionEntry>>;
  section529TaxpayerTotal: Decimal;
  section529SpouseTotal: Decimal;
  ableTaxpayerTotal: Decimal;
  ableSpouseTotal: Decimal;
  medicalSavingsAccountDeduction: Decimal;
  spouseMedicalSavingsAccountDeduction: Decimal;
  healthSavingsAccountDeduction: Decimal;
  spouseHealthSavingsAccountDeduction: Decimal;
  studentLoanInterestDeduction: Decimal;
  spouseStudentLoanInterestDeduction: Decimal;
  taxpayerDeductionsBeforeIncomeLimit: Decimal;
  spouseDeductionsBeforeIncomeLimit: Decimal;
  taxpayerPATaxableIncome: Decimal;
  spousePATaxableIncome: Decimal;
  taxpayerAllowedDeduction: Decimal;
  spouseAllowedDeduction: Decimal;
  totalOtherDeductions: Decimal;
  lines: CalculatedLine[];
}

function roundedNonNegative(value?: Decimal): Decimal {
  return zeroFloor(roundDollar(value ?? new Decimal(0)));
}

export function calculatePAScheduleO(input: PAScheduleOInput): PAScheduleOResult {
  const constants = PA_SCHEDULE_O_CONSTANTS[input.taxYear];
  if (!constants) {
    throw new Error(`PA Schedule O constants not available for tax year ${input.taxYear}`);
  }

  const audit = new AuditTrail();

  const qualifiedTuitionContributions = (input.qualifiedTuitionContributions ?? []).map((entry) => ({
    beneficiaryName: entry.beneficiaryName,
    beneficiarySSN: entry.beneficiarySSN,
    taxpayerContribution: min(
      roundedNonNegative(entry.taxpayerContribution),
      constants.section529ContributionLimit,
    ),
    spouseContribution: min(
      roundedNonNegative(entry.spouseContribution),
      constants.section529ContributionLimit,
    ),
  }));

  const section529TaxpayerTotal = sum(...qualifiedTuitionContributions.map((entry) => entry.taxpayerContribution));
  const section529SpouseTotal = sum(...qualifiedTuitionContributions.map((entry) => entry.spouseContribution));
  audit.record("PA-Schedule-O", "2(c)", "Total IRC Section 529 contributions - taxpayer", section529TaxpayerTotal, "Sum of capped Line 1 taxpayer contribution amounts");
  audit.record("PA-Schedule-O", "2(d)", "Total IRC Section 529 contributions - spouse", section529SpouseTotal, "Sum of capped Line 1 spouse contribution amounts");

  const ableContributions = (input.ableContributions ?? []).map((entry) => ({
    beneficiaryName: entry.beneficiaryName,
    beneficiarySSN: entry.beneficiarySSN,
    taxpayerContribution: roundedNonNegative(entry.taxpayerContribution),
    spouseContribution: roundedNonNegative(entry.spouseContribution),
  })).map((entry) => {
    const combinedContribution = entry.taxpayerContribution.plus(entry.spouseContribution);
    if (combinedContribution.greaterThan(constants.ableAnnualExclusion)) {
      throw new Error(
        `PA Schedule O Line 3 combined taxpayer and spouse ABLE contributions for ${entry.beneficiaryName} cannot exceed ${constants.ableAnnualExclusion.toString()}`,
      );
    }

    return entry;
  });

  const ableTaxpayerTotal = sum(...ableContributions.map((entry) => entry.taxpayerContribution));
  if (ableTaxpayerTotal.greaterThan(constants.ableAnnualExclusion)) {
    throw new Error(
      `PA Schedule O Line 3 taxpayer ABLE contributions across all beneficiaries cannot exceed ${constants.ableAnnualExclusion.toString()}`,
    );
  }

  const ableSpouseTotal = sum(...ableContributions.map((entry) => entry.spouseContribution));
  if (ableSpouseTotal.greaterThan(constants.ableAnnualExclusion)) {
    throw new Error(
      `PA Schedule O Line 3 spouse ABLE contributions across all beneficiaries cannot exceed ${constants.ableAnnualExclusion.toString()}`,
    );
  }

  audit.record("PA-Schedule-O", "4(c)", "Total IRC Section 529A contributions - taxpayer", ableTaxpayerTotal, "Validated taxpayer ABLE contributions within the annual federal gift-tax exclusion amount");
  audit.record("PA-Schedule-O", "4(d)", "Total IRC Section 529A contributions - spouse", ableSpouseTotal, "Validated spouse ABLE contributions within the annual federal gift-tax exclusion amount");

  const medicalSavingsAccountDeduction = roundedNonNegative(input.medicalSavingsAccountDeduction);
  const spouseMedicalSavingsAccountDeduction = roundedNonNegative(input.spouseMedicalSavingsAccountDeduction);
  audit.record("PA-Schedule-O", "5(c)", "Medical Savings Account deduction - taxpayer", medicalSavingsAccountDeduction, "Federally allowed Medical Savings Account deduction amount");
  audit.record("PA-Schedule-O", "5(d)", "Medical Savings Account deduction - spouse", spouseMedicalSavingsAccountDeduction, "Federally allowed Medical Savings Account deduction amount");

  const healthSavingsAccountDeduction = roundedNonNegative(input.healthSavingsAccountDeduction);
  const spouseHealthSavingsAccountDeduction = roundedNonNegative(input.spouseHealthSavingsAccountDeduction);
  audit.record("PA-Schedule-O", "6(c)", "Health Savings Account deduction - taxpayer", healthSavingsAccountDeduction, "Federally allowed Health Savings Account deduction amount");
  audit.record("PA-Schedule-O", "6(d)", "Health Savings Account deduction - spouse", spouseHealthSavingsAccountDeduction, "Federally allowed Health Savings Account deduction amount");

  const studentLoanInterestDeduction = min(
    roundedNonNegative(input.studentLoanInterestDeduction),
    constants.studentLoanInterestCap,
  );
  const spouseStudentLoanInterestDeduction = min(
    roundedNonNegative(input.spouseStudentLoanInterestDeduction),
    constants.studentLoanInterestCap,
  );
  audit.record("PA-Schedule-O", "7(c)", "Student Loan Interest deduction - taxpayer", studentLoanInterestDeduction, "Federally allowed student loan interest deduction amount capped for the tax year");
  audit.record("PA-Schedule-O", "7(d)", "Student Loan Interest deduction - spouse", spouseStudentLoanInterestDeduction, "Federally allowed student loan interest deduction amount capped for the tax year");

  const taxpayerDeductionsBeforeIncomeLimit = sum(
    section529TaxpayerTotal,
    ableTaxpayerTotal,
    medicalSavingsAccountDeduction,
    healthSavingsAccountDeduction,
    studentLoanInterestDeduction,
  );
  const spouseDeductionsBeforeIncomeLimit = sum(
    section529SpouseTotal,
    ableSpouseTotal,
    spouseMedicalSavingsAccountDeduction,
    spouseHealthSavingsAccountDeduction,
    spouseStudentLoanInterestDeduction,
  );
  audit.record("PA-Schedule-O", "8(c)", "Deductions before income limitation - taxpayer", taxpayerDeductionsBeforeIncomeLimit, "Line 2(c) + Line 4(c) + Line 5(c) + Line 6(c) + Line 7(c)");
  audit.record("PA-Schedule-O", "8(d)", "Deductions before income limitation - spouse", spouseDeductionsBeforeIncomeLimit, "Line 2(d) + Line 4(d) + Line 5(d) + Line 6(d) + Line 7(d)");

  const taxpayerPATaxableIncome = roundedNonNegative(input.taxpayerPATaxableIncome);
  const spousePATaxableIncome = roundedNonNegative(input.spousePATaxableIncome);
  audit.record("PA-Schedule-O", "9(c)", "PA taxable income limit - taxpayer", taxpayerPATaxableIncome, "Separately computed taxpayer share of PA-40 Line 9 income");
  audit.record("PA-Schedule-O", "9(d)", "PA taxable income limit - spouse", spousePATaxableIncome, "Separately computed spouse share of PA-40 Line 9 income");

  const taxpayerAllowedDeduction = min(taxpayerDeductionsBeforeIncomeLimit, taxpayerPATaxableIncome);
  const spouseAllowedDeduction = min(spouseDeductionsBeforeIncomeLimit, spousePATaxableIncome);
  audit.record("PA-Schedule-O", "10(c)", "Allowed deduction after limitation - taxpayer", taxpayerAllowedDeduction, "Lesser of Line 8(c) or Line 9(c)");
  audit.record("PA-Schedule-O", "10(d)", "Allowed deduction after limitation - spouse", spouseAllowedDeduction, "Lesser of Line 8(d) or Line 9(d)");

  const totalOtherDeductions = taxpayerAllowedDeduction.plus(spouseAllowedDeduction);
  audit.record("PA-Schedule-O", "11", "Total other deductions", totalOtherDeductions, "Line 10(c) + Line 10(d)");

  return {
    qualifiedTuitionContributions,
    ableContributions,
    section529TaxpayerTotal,
    section529SpouseTotal,
    ableTaxpayerTotal,
    ableSpouseTotal,
    medicalSavingsAccountDeduction,
    spouseMedicalSavingsAccountDeduction,
    healthSavingsAccountDeduction,
    spouseHealthSavingsAccountDeduction,
    studentLoanInterestDeduction,
    spouseStudentLoanInterestDeduction,
    taxpayerDeductionsBeforeIncomeLimit,
    spouseDeductionsBeforeIncomeLimit,
    taxpayerPATaxableIncome,
    spousePATaxableIncome,
    taxpayerAllowedDeduction,
    spouseAllowedDeduction,
    totalOtherDeductions,
    lines: audit.getLines(),
  };
}
