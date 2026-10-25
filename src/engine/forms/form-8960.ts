/**
 * Form 8960 — Net Investment Income Tax (NIIT)
 * Spec: spec/federal/form-8960.yaml
 *
 * 3.8% tax on the lesser of net investment income or MAGI excess
 * over threshold. Threshold: $200K single/HoH, $250K MFJ, $125K MFS.
 */

import Decimal from "decimal.js";
import type { CalculatedLine } from "@/models/outputs.js";
import type { FilingStatus, YearConstants } from "@/models/constants.js";
import { zeroFloor, min, roundDollar, sum } from "@/utils/decimal.js";
import { AuditTrail } from "@/utils/audit.js";

export interface Form8960Input {
  taxableInterest: Decimal; // Line 1
  ordinaryDividends: Decimal; // Line 4a
  netCapitalGain: Decimal; // Line 5a (net gain, zero if loss)
  otherInvestmentIncome?: Decimal; // Line 7 (rents, royalties, etc.)
  investmentExpenses?: Decimal; // Line 9 deductions
  additionalModifications?: Decimal; // Line10 properly allocable deductions
  magi: Decimal; // Modified AGI
}

export interface Form8960Result {
  taxableInterest: Decimal; // Line 1
  dividends: Decimal; // Line 4a
  netCapitalGain: Decimal; // Line 5a
  grossInvestmentIncome: Decimal; // Line8 before PartII
  investmentExpenses: Decimal; // Actual supplied line9 deductions
  additionalModifications: Decimal; // Line10
  netInvestmentIncome: Decimal; // Line12
  threshold: Decimal; // Line 11
  magiExcess: Decimal; // Line 13
  taxableBase: Decimal; // Line 14
  niitTax: Decimal; // Line 17
  lines: CalculatedLine[];
}

export function calculateForm8960(
  input: Form8960Input,
  filingStatus: FilingStatus,
  constants: YearConstants
): Form8960Result {
  const audit = new AuditTrail();
  const rate = constants.niit.rate;
  const threshold = constants.niit.threshold[filingStatus];

  // Line 1: Taxable interest
  audit.record("Form 8960", "1", "Taxable interest", input.taxableInterest,
    "1040 Line 2b");

  // Line 4a: Dividends
  audit.record("Form 8960", "4a", "Ordinary dividends", input.ordinaryDividends,
    "1040 Line 3b");

  // Line 5a: Net capital gain
  audit.record("Form 8960", "5a", "Net gain from capital assets", input.netCapitalGain,
    "Schedule D net gain (zero-floored)");

  // Line 8: Net investment income
  const grossInvestmentIncome = sum(
    input.taxableInterest,
    input.ordinaryDividends,
    input.netCapitalGain,
    input.otherInvestmentIncome ?? new Decimal(0)
  );
  const investmentExpenses = input.investmentExpenses ?? new Decimal(0);
  const additionalModifications = input.additionalModifications ?? new Decimal(0);
  if (![investmentExpenses, additionalModifications].every(value => value.isFinite() && value.gte(0))) {
    throw new Error("NIIT deduction amounts must be finite and nonnegative");
  }
  const netInvestmentIncome = zeroFloor(grossInvestmentIncome.minus(investmentExpenses).minus(additionalModifications));
  audit.record("Form 8960", "10", "Additional modifications", additionalModifications,
    "Actual properly allocable deductions not included on lines1-9");
  audit.record("Form 8960", "8", "Net investment income", netInvestmentIncome,
    "Gross investment income - expenses");

  // Line 11: Threshold
  audit.record("Form 8960", "11", "MAGI threshold", threshold,
    `${filingStatus} threshold`);

  // Line 13: Excess of MAGI over threshold
  const magiExcess = zeroFloor(input.magi.minus(threshold));
  audit.record("Form 8960", "13", "MAGI excess", magiExcess,
    `MAGI ${input.magi} - threshold ${threshold}`);

  // Line 14: Taxable base = lesser of NII or MAGI excess
  const taxableBase = min(netInvestmentIncome, magiExcess);
  audit.record("Form 8960", "14", "Taxable base", taxableBase,
    "min(NII, MAGI excess)");

  // Line 17: NIIT
  const niitTax = roundDollar(taxableBase.times(rate));
  audit.record("Form 8960", "17", "Net Investment Income Tax", niitTax,
    `${taxableBase} × ${rate}`);

  return {
    taxableInterest: input.taxableInterest,
    dividends: input.ordinaryDividends,
    netCapitalGain: input.netCapitalGain,
    grossInvestmentIncome,
    investmentExpenses,
    additionalModifications,
    netInvestmentIncome,
    threshold,
    magiExcess,
    taxableBase,
    niitTax,
    lines: audit.getLines(),
  };
}
