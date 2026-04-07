/**
 * Generic Resident State Income Tax Engine
 * Spec: spec/state/generic-resident-return.yaml
 *
 * Produces best-effort draft returns for any state with income tax
 * by applying the common 80% pattern:
 *   1. Start from federal AGI (or federal taxable income for some states)
 *   2. Apply state standard deduction by filing status
 *   3. Compute state taxable income
 *   4. Look up tax from state bracket schedule by filing status
 *   5. Apply personal exemption credits/deductions
 *   6. Subtract state withholding and estimated payments
 *   7. Compute refund or balance due
 */

import Decimal from "decimal.js";
import { zeroFloor, roundDollar, min } from "@/utils/decimal.js";
import { AuditTrail } from "@/utils/audit.js";
import type { CalculatedLine } from "@/models/outputs.js";
import type { FilingStatus } from "@/models/constants.js";
import {
  STATE_CONSTANTS,
  type StateStandardDeductionRange,
  type StateYearConstants,
  type StateTaxBracket,
} from "@/models/state-constants.js";

export type ConfidenceTier = "validated" | "best-effort";

export interface GenericStateReturnInput {
  stateCode: string;
  taxYear: number;
  filingStatus: FilingStatus;
  federalAGI: Decimal;
  federalTaxableIncome: Decimal;
  /** State-specific additions to income (default 0) */
  stateAdditions?: Decimal;
  /** State-specific subtractions from income (default 0) */
  stateSubtractions?: Decimal;
  /** Override: use itemized deductions instead of standard (lesser-of logic) */
  itemizedDeductions?: Decimal;
  /** Number of dependents */
  dependentCount: number;
  /** Whether filing jointly (determines spouse exemption) */
  hasSpouse: boolean;
  /** Total state income tax withheld from W-2s, 1099s, etc. */
  stateWithholding: Decimal;
  /** State estimated tax payments made during the year */
  stateEstimatedPayments: Decimal;
}

export interface GenericStateReturnResult {
  stateCode: string;
  stateName: string;
  taxYear: number;
  confidence: ConfidenceTier;

  // Income
  startingIncome: Decimal;
  stateAdditions: Decimal;
  stateSubtractions: Decimal;
  stateAdjustedIncome: Decimal;

  // Deductions
  standardDeduction: Decimal;
  itemizedDeductions: Decimal;
  deductionUsed: "standard" | "itemized";
  deductionAmount: Decimal;

  // Exemptions
  personalExemptions: Decimal;
  exemptionCount: number;

  // Tax
  stateTaxableIncome: Decimal;
  taxBeforeCredits: Decimal;
  exemptionCredit: Decimal;
  stateTax: Decimal;

  // Payments
  stateWithholding: Decimal;
  stateEstimatedPayments: Decimal;
  totalPayments: Decimal;

  // Final
  balanceDue: Decimal;
  refund: Decimal;

  lines: CalculatedLine[];
}

/**
 * Look up state constants for a given state and year.
 * Throws if the state/year combination is not available.
 */
export function getStateConstants(
  stateCode: string,
  taxYear: number
): StateYearConstants {
  const stateData = STATE_CONSTANTS[stateCode];
  if (!stateData) {
    throw new Error(
      `State constants not available for ${stateCode}. ` +
        `Available states: ${Object.keys(STATE_CONSTANTS).sort().join(", ")}`
    );
  }
  const yearData = stateData[taxYear];
  if (!yearData) {
    throw new Error(
      `State constants not available for ${stateCode} tax year ${taxYear}. ` +
        `Available years: ${Object.keys(stateData).join(", ")}`
    );
  }
  return yearData;
}

/**
 * Compute graduated tax from a bracket schedule.
 * Each bracket's rate applies only to income within [min, max].
 */
export function computeGraduatedTax(
  taxableIncome: Decimal,
  brackets: StateTaxBracket[]
): Decimal {
  let tax = new Decimal(0);
  for (const bracket of brackets) {
    if (taxableIncome.lte(bracket.min)) break;
    const upper = bracket.max !== null ? min(taxableIncome, bracket.max) : taxableIncome;
    const taxableInBracket = zeroFloor(upper.minus(bracket.min));
    tax = tax.plus(taxableInBracket.times(bracket.rate));
  }
  return roundDollar(tax);
}

/**
 * Resolve filing status candidates with fallback logic.
 */
function getFilingStatusCandidates(
  filingStatus: FilingStatus
): FilingStatus[] {
  const fallbackMap: Partial<Record<FilingStatus, FilingStatus[]>> = {
    head_of_household: ["single"],
    qualifying_surviving_spouse: ["married_filing_jointly"],
    married_filing_separately: ["single"],
  };
  return [filingStatus, ...(fallbackMap[filingStatus] ?? []), "single"];
}

/**
 * Resolve the bracket schedule for a given filing status.
 * Falls back: HOH → Single, QSS → MFJ, MFS → Single.
 */
function resolveBrackets(
  constants: StateYearConstants,
  filingStatus: FilingStatus
): StateTaxBracket[] {
  for (const candidate of getFilingStatusCandidates(filingStatus)) {
    const brackets = constants.taxBrackets[candidate];
    if (brackets) return brackets;
  }

  throw new Error(
    `No tax brackets available for ${constants.name} filing status ${filingStatus}`
  );
}

/**
 * Resolve a filing-status-keyed value with fallback logic.
 */
function resolveByFilingStatus(
  values: Partial<Record<FilingStatus, Decimal>>,
  filingStatus: FilingStatus
): Decimal {
  for (const candidate of getFilingStatusCandidates(filingStatus)) {
    const value = values[candidate];
    if (value !== undefined) return value;
  }

  return new Decimal(0);
}

function resolveTableByFilingStatus(
  values: Partial<Record<FilingStatus, StateStandardDeductionRange[]>>,
  filingStatus: FilingStatus
): StateStandardDeductionRange[] | undefined {
  for (const candidate of getFilingStatusCandidates(filingStatus)) {
    const value = values[candidate];
    if (value !== undefined) return value;
  }

  return undefined;
}

function resolveAmountFromRangeTable(
  table: StateStandardDeductionRange[],
  income: Decimal
): Decimal {
  for (const row of table) {
    const inLowerBound = income.gte(row.min);
    const inUpperBound =
      row.max === null ||
      (row.maxExclusive ? income.lt(row.max) : income.lte(row.max));
    if (inLowerBound && inUpperBound) {
      return row.amount;
    }
  }

  return new Decimal(0);
}

function resolveStandardDeduction(
  constants: StateYearConstants,
  filingStatus: FilingStatus,
  stateAdjustedIncome: Decimal
): {
  amount: Decimal;
  source: "fixed" | "table";
} {
  const deductionTable = constants.standardDeductionTable
    ? resolveTableByFilingStatus(constants.standardDeductionTable, filingStatus)
    : undefined;
  if (deductionTable) {
    return {
      amount: resolveAmountFromRangeTable(deductionTable, stateAdjustedIncome),
      source: "table",
    };
  }

  return {
    amount: resolveByFilingStatus(constants.standardDeduction, filingStatus),
    source: "fixed",
  };
}

function resolvePersonalExemptions(
  constants: StateYearConstants,
  filingStatus: FilingStatus,
  stateAdjustedIncome: Decimal,
  dependentCount: number,
  hasSpouse: boolean
): {
  amount: Decimal;
  source: "income_table" | "filing_status_base" | "per_person";
  taxpayerExemption: Decimal;
  spouseExemption: Decimal;
  dependentExemption: Decimal;
} {
  const incomeBasedBaseExemptionTable = constants.personalExemption.incomeBasedBaseAmounts
    ? resolveTableByFilingStatus(constants.personalExemption.incomeBasedBaseAmounts, filingStatus)
    : undefined;
  const dependentExemption = constants.personalExemption.dependentAmount.times(dependentCount);

  if (incomeBasedBaseExemptionTable) {
    const taxpayerExemption = resolveAmountFromRangeTable(
      incomeBasedBaseExemptionTable,
      stateAdjustedIncome
    );

    return {
      amount: taxpayerExemption.plus(dependentExemption),
      source: "income_table",
      taxpayerExemption,
      spouseExemption: new Decimal(0),
      dependentExemption,
    };
  }

  const filingStatusBaseExemption = constants.personalExemption.filingStatusBaseAmounts
    ? resolveByFilingStatus(constants.personalExemption.filingStatusBaseAmounts, filingStatus)
    : undefined;
  if (filingStatusBaseExemption !== undefined) {
    return {
      amount: filingStatusBaseExemption.plus(dependentExemption),
      source: "filing_status_base",
      taxpayerExemption: filingStatusBaseExemption,
      spouseExemption: new Decimal(0),
      dependentExemption,
    };
  }

  const taxpayerExemption = constants.personalExemption.amount;
  const spouseExemption = hasSpouse ? constants.personalExemption.spouseAmount : new Decimal(0);

  return {
    amount: taxpayerExemption.plus(spouseExemption).plus(dependentExemption),
    source: "per_person",
    taxpayerExemption,
    spouseExemption,
    dependentExemption,
  };
}

/**
 * Calculate a generic state resident income tax return.
 */
export function calculateGenericStateReturn(
  input: GenericStateReturnInput
): GenericStateReturnResult {
  const constants = getStateConstants(input.stateCode, input.taxYear);
  const audit = new AuditTrail();
  const form = `${input.stateCode}-Generic`;
  const usesApproximateFederalAGI =
    !constants.useFederalAGI && !constants.usesFederalTaxableIncome;

  // Line 1: Starting income
  const startingIncome = constants.usesFederalTaxableIncome
    ? input.federalTaxableIncome
    : input.federalAGI;
  audit.record(
    form,
    "1",
    constants.usesFederalTaxableIncome
      ? "Federal taxable income"
      : usesApproximateFederalAGI
        ? "Approximate starting income from federal AGI"
        : "Federal adjusted gross income",
    startingIncome,
    constants.usesFederalTaxableIncome
      ? "Form 1040 Line 15"
      : usesApproximateFederalAGI
        ? "Best-effort approximation from Form 1040 Line 11; state does not directly use federal AGI"
        : "Form 1040 Line 11",
    { startingIncome }
  );

  // Line 2: State additions
  const stateAdditions = input.stateAdditions ?? new Decimal(0);
  audit.record(form, "2", "State additions to income", stateAdditions, "State-specific additions", {
    stateAdditions,
  });

  // Line 3: State subtractions
  const stateSubtractions = input.stateSubtractions ?? new Decimal(0);
  audit.record(form, "3", "State subtractions from income", stateSubtractions, "State-specific subtractions", {
    stateSubtractions,
  });

  // Line 4: State adjusted income
  const stateAdjustedIncome = startingIncome.plus(stateAdditions).minus(stateSubtractions);
  audit.record(form, "4", "State adjusted income", stateAdjustedIncome, "Line 1 + Line 2 - Line 3", {
    startingIncome,
    stateAdditions,
    stateSubtractions,
  });

  // Line 5: Standard deduction
  const {
    amount: standardDeduction,
    source: standardDeductionSource,
  } = resolveStandardDeduction(constants, input.filingStatus, stateAdjustedIncome);
  audit.record(
    form,
    "5",
    "Standard deduction",
    standardDeduction,
    standardDeductionSource === "table"
      ? "State standard deduction table by filing status and state adjusted income"
      : "State standard deduction by filing status",
    {
      filingStatus: input.filingStatus,
      stateAdjustedIncome,
    }
  );

  // Line 6: Itemized deductions (if provided)
  const itemizedDeductions = input.itemizedDeductions ?? new Decimal(0);

  // Line 7: Deduction used (state standard deduction unless itemized is lower)
  const useItemized = itemizedDeductions.gt(0) && itemizedDeductions.lt(standardDeduction);
  const deductionUsed: "standard" | "itemized" = useItemized ? "itemized" : "standard";
  const deductionAmount = useItemized ? itemizedDeductions : standardDeduction;
  audit.record(
    form,
    "7",
    `Deduction used (${deductionUsed})`,
    deductionAmount,
    "State standard deduction unless itemized deductions are lower",
    {
      standardDeduction,
      itemizedDeductions,
    }
  );
  const deductionReducesIncome =
    (constants.standardDeductionMode ?? "taxable_income") === "taxable_income";

  // Line 8: Personal exemptions
  let exemptionCount = 1; // taxpayer
  if (input.hasSpouse) exemptionCount += 1;
  exemptionCount += input.dependentCount;

  const {
    amount: personalExemptions,
    source: personalExemptionSource,
    taxpayerExemption,
    spouseExemption,
    dependentExemption,
  } = resolvePersonalExemptions(
    constants,
    input.filingStatus,
    stateAdjustedIncome,
    input.dependentCount,
    input.hasSpouse
  );
  audit.record(
    form,
    "8",
    "Personal exemptions",
    personalExemptions,
    personalExemptionSource === "income_table"
      ? "Income-based filing-status exemption table + dependents"
      : personalExemptionSource === "filing_status_base"
        ? "Filing-status base exemption + dependents"
        : "Taxpayer + spouse + dependents",
    {
      taxpayerExemption,
      spouseExemption,
      dependentExemption,
      dependentCount: input.dependentCount.toString(),
      personalExemptionSource,
    }
  );

  // Line 9: State taxable income
  let taxableIncomeBase = stateAdjustedIncome;
  let taxableIncomeFormula = "Line 4";
  if (deductionReducesIncome) {
    taxableIncomeBase = taxableIncomeBase.minus(deductionAmount);
    taxableIncomeFormula = "Line 4 - Line 7";
  }
  if (!constants.exemptionsAreCredits) {
    taxableIncomeBase = taxableIncomeBase.minus(personalExemptions);
    taxableIncomeFormula = deductionReducesIncome ? "Line 4 - Line 7 - Line 8" : "Line 4 - Line 8";
  }
  let stateTaxableIncome = zeroFloor(taxableIncomeBase);
  stateTaxableIncome = roundDollar(stateTaxableIncome);
  audit.record(form, "9", "State taxable income", stateTaxableIncome, taxableIncomeFormula, {
    stateAdjustedIncome,
    deductionAmount,
    deductionReducesIncome: deductionReducesIncome ? "yes" : "no",
    ...(constants.exemptionsAreCredits ? {} : { personalExemptions }),
  });

  // Line 10: Tax from brackets
  const brackets = resolveBrackets(constants, input.filingStatus);
  const taxBeforeCredits = computeGraduatedTax(stateTaxableIncome, brackets);
  audit.record(form, "10", "Tax from bracket schedule", taxBeforeCredits, "Graduated rate computation", {
    stateTaxableIncome,
    bracketCount: brackets.length.toString(),
  });

  // Line 11: Exemption credit (only if exemptions are credits)
  let exemptionCredit = new Decimal(0);
  let phaseOutReduction = new Decimal(0);
  if (constants.exemptionsAreCredits) {
    let creditBase = personalExemptions;
    if (!deductionReducesIncome) {
      creditBase = creditBase.plus(deductionAmount);
    }
    exemptionCredit = constants.creditRate
      ? roundDollar(creditBase.times(constants.creditRate))
      : roundDollar(creditBase);
    if (constants.exemptionPhaseOut) {
      const threshold = resolveByFilingStatus(
        constants.exemptionPhaseOut.threshold,
        input.filingStatus
      );
      if (stateTaxableIncome.gt(threshold)) {
        phaseOutReduction = roundDollar(
          stateTaxableIncome.minus(threshold).div(constants.exemptionPhaseOut.divisor)
        );
        exemptionCredit = zeroFloor(exemptionCredit.minus(phaseOutReduction));
      }
    }
    exemptionCredit = min(exemptionCredit, taxBeforeCredits); // Can't exceed tax
  }
  audit.record(form, "11", "Personal exemption credit", exemptionCredit, constants.exemptionsAreCredits
    ? "Exemption credit base with optional credit rate and phase-out (capped at tax)"
    : "N/A - exemptions applied as deductions", {
    personalExemptions,
    deductionAmount,
    creditRate: constants.creditRate?.toString() ?? "direct",
    phaseOutReduction,
    exemptionCredit,
  });

  // Line 12: State tax after credits
  const stateTax = zeroFloor(taxBeforeCredits.minus(exemptionCredit));
  audit.record(form, "12", "State income tax", stateTax, "Line 10 - Line 11", {
    taxBeforeCredits,
    exemptionCredit,
  });

  // Line 13: State withholding
  audit.record(form, "13", "State income tax withheld", input.stateWithholding, "W-2 Box 17 + other withholding", {
    stateWithholding: input.stateWithholding,
  });

  // Line 14: Estimated tax payments
  audit.record(form, "14", "State estimated tax payments", input.stateEstimatedPayments, "Quarterly estimated payments", {
    stateEstimatedPayments: input.stateEstimatedPayments,
  });

  // Line 15: Total payments
  const totalPayments = input.stateWithholding.plus(input.stateEstimatedPayments);
  audit.record(form, "15", "Total state payments", totalPayments, "Line 13 + Line 14", {
    stateWithholding: input.stateWithholding,
    stateEstimatedPayments: input.stateEstimatedPayments,
  });

  // Line 16: Balance due or refund
  const netOwed = stateTax.minus(totalPayments);
  const balanceDue = zeroFloor(netOwed);
  const refund = zeroFloor(netOwed.neg());
  audit.record(form, "16", netOwed.gte(0) ? "Balance due" : "Refund", netOwed.abs(), "Line 12 - Line 15", {
    stateTax,
    totalPayments,
  });

  return {
    stateCode: input.stateCode,
    stateName: constants.name,
    taxYear: input.taxYear,
    confidence: "best-effort",
    startingIncome,
    stateAdditions,
    stateSubtractions,
    stateAdjustedIncome,
    standardDeduction,
    itemizedDeductions,
    deductionUsed,
    deductionAmount,
    personalExemptions,
    exemptionCount,
    stateTaxableIncome,
    taxBeforeCredits,
    exemptionCredit,
    stateTax,
    stateWithholding: input.stateWithholding,
    stateEstimatedPayments: input.stateEstimatedPayments,
    totalPayments,
    balanceDue,
    refund,
    lines: audit.getLines().map((line) => ({
      ...line,
      confidence: "best-effort",
    })),
  };
}

/** List all states that have constants loaded for a given tax year */
export function getAvailableStates(taxYear: number): string[] {
  return Object.entries(STATE_CONSTANTS)
    .filter(([, years]) => years[taxYear] !== undefined)
    .map(([code]) => code)
    .sort();
}
