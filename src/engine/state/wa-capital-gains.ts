/**
 * Washington State Capital Gains Tax
 * Spec: spec/state/wa-capital-gains.yaml
 *
 * WA imposes a 7% excise tax on long-term capital gains exceeding $278,000 (2025),
 * plus an additional 2.90% on the portion exceeding $1,000,000 (RCW 82.87.040).
 */

import Decimal from "decimal.js";
import { zeroFloor, roundDollar, min } from "@/utils/decimal.js";
import { AuditTrail } from "@/utils/audit.js";
import type { CalculatedLine } from "@/models/outputs.js";

export interface WACapitalGainsConstants {
  standardDeduction: Decimal;
  rate: Decimal;
  surtaxRate?: Decimal;
  surtaxThreshold?: Decimal;
  charitableDeductionCap: Decimal; // RCW 82.87.080(2): $100K base, inflation-adjusted
}

export const WA_CG_CONSTANTS: Record<number, WACapitalGainsConstants> = {
  2024: {
    standardDeduction: new Decimal(270000),
    rate: new Decimal(0.07),
    charitableDeductionCap: new Decimal(108000), // WA DOR 2024
  },
  2025: {
    standardDeduction: new Decimal(278000),
    rate: new Decimal(0.07),
    surtaxRate: new Decimal(0.029),
    surtaxThreshold: new Decimal(1000000),
    charitableDeductionCap: new Decimal(111000), // WA DOR 2025
  },
};

export interface WACapitalGainsResult {
  totalLTCG: Decimal;
  deductions: Decimal;
  netLTCG: Decimal;
  standardDeduction: Decimal;
  taxableAmount: Decimal;
  baseTax: Decimal;
  surtax: Decimal;
  tax: Decimal;
  lines: CalculatedLine[];
}

export function calculateWACapitalGainsTax(
  longTermCapitalGains: Decimal,
  charitableDeductions: Decimal,
  taxYear: number
): WACapitalGainsResult {
  const constants = WA_CG_CONSTANTS[taxYear];
  if (!constants) {
    throw new Error(`WA capital gains constants not available for ${taxYear}`);
  }

  const audit = new AuditTrail();

  audit.record("WA-CG", "1", "Total long-term capital gains", longTermCapitalGains, "Federal Schedule D LTCG");

  // RCW 82.87.080(2): charitable deduction capped at inflation-adjusted limit
  const cappedDeductions = min(charitableDeductions, constants.charitableDeductionCap);
  audit.record("WA-CG", "2", "Allowable deductions", cappedDeductions,
    `min(${charitableDeductions}, $${constants.charitableDeductionCap} cap per RCW 82.87.080(2))`);

  const netLTCG = zeroFloor(longTermCapitalGains.minus(cappedDeductions));
  audit.record("WA-CG", "3", "Net long-term capital gains", netLTCG, "Line 1 - Line 2");

  audit.record("WA-CG", "4", "Standard deduction", constants.standardDeduction, `$${constants.standardDeduction} for ${taxYear}`);

  const taxableAmount = zeroFloor(netLTCG.minus(constants.standardDeduction));
  audit.record("WA-CG", "5", "Taxable capital gains", taxableAmount, "Line 3 - Line 4, floor at 0");

  const baseTax = roundDollar(taxableAmount.times(constants.rate));

  let surtax = new Decimal(0);
  if (constants.surtaxRate && constants.surtaxThreshold) {
    const surtaxBase = zeroFloor(taxableAmount.minus(constants.surtaxThreshold));
    surtax = roundDollar(surtaxBase.times(constants.surtaxRate));

    audit.record("WA-CG", "6", "Base capital gains tax", baseTax, `Line 5 × ${constants.rate.times(100)}%`);
    audit.record("WA-CG", "7", "Additional capital gains tax", surtax,
      `${constants.surtaxRate.times(100)}% × max(0, Line 5 - $${constants.surtaxThreshold})`);

    const tax = baseTax.plus(surtax);
    audit.record("WA-CG", "8", "Total Washington capital gains tax", tax, "Line 6 + Line 7");

    return {
      totalLTCG: longTermCapitalGains,
      deductions: cappedDeductions,
      netLTCG,
      standardDeduction: constants.standardDeduction,
      taxableAmount,
      baseTax,
      surtax,
      tax,
      lines: audit.getLines(),
    };
  }

  audit.record("WA-CG", "6", "Washington capital gains tax", baseTax, `Line 5 × ${constants.rate.times(100)}%`);

  return {
    totalLTCG: longTermCapitalGains,
    deductions: cappedDeductions,
    netLTCG,
    standardDeduction: constants.standardDeduction,
    taxableAmount,
    baseTax,
    surtax,
    tax: baseTax,
    lines: audit.getLines(),
  };
}
