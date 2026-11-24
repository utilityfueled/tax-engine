import Decimal from "decimal.js";
import { getConstants, type FilingStatus } from "@/models/constants.js";
import { FEDERAL_2026_INDEXED } from "@/models/federal-2026-indexed.js";
import type { CalculatedLine } from "@/models/outputs.js";
import { AuditTrail } from "@/utils/audit.js";
import { d, min, zeroFloor } from "@/utils/decimal.js";
import { calculateUnroundedTaxFromBrackets } from "@/utils/tax-math.js";

export interface OrdinaryShortAccountingYearTaxInput {
  taxYear: number;
  filingStatus: FilingStatus;
  /** Whole months established from a living filer's confirmed accounting-period change. */
  shortPeriodMonths: number;
  /** Actual §443(b)(3) base after allowable deductions, with no standard deduction. */
  modifiedTaxableIncome: Decimal;
  /** Actual signed Form 6251 income before application of the AMT exemption. */
  shortPeriodAmti: Decimal;
}

export interface OrdinaryShortAccountingYearTaxResult {
  annualizedModifiedTaxableIncome: Decimal;
  annualRegularTax: Decimal;
  regularTax: Decimal;
  annualizedAmti: Decimal;
  amtExemption: Decimal;
  amtRateBase: Decimal;
  annualTentativeMinimumTax: Decimal;
  tentativeMinimumTax: Decimal;
  additionalMinimumTax: Decimal;
  lines: CalculatedLine[];
}

/** Internal calculation candidate for established ordinary-rate, no-credit tax bases. */
export function calculateOrdinaryShortAccountingYearTax(
  input: OrdinaryShortAccountingYearTaxInput,
): OrdinaryShortAccountingYearTaxResult {
  const { taxYear, filingStatus, shortPeriodMonths, modifiedTaxableIncome, shortPeriodAmti } = input;
  if (taxYear !== 2025 && taxYear !== 2026) {
    throw new Error(`Short accounting-year rate schedules are unavailable for year ${taxYear}`);
  }
  if (filingStatus !== "single") throw new Error("This short accounting-year calculation requires a single filer");
  if (!Number.isInteger(shortPeriodMonths) || shortPeriodMonths < 1 || shortPeriodMonths > 11) {
    throw new Error("Short accounting-year calculation requires one to eleven whole months");
  }
  if (![modifiedTaxableIncome, shortPeriodAmti].every(value => Decimal.isDecimal(value) && value.isFinite())) {
    throw new Error("Both short accounting-year tax bases must be finite Decimal amounts");
  }

  const { taxBrackets, amt } = taxYear === 2026 ? FEDERAL_2026_INDEXED : getConstants(taxYear);
  const months = d(shortPeriodMonths);
  const yearMonths = d("12");
  const audit = new AuditTrail();
  const form = "IRC Section 443";

  // Keep the annual amounts over the common denominator of short-period
  // months. Proration cancels that denominator before any division occurs.
  const regularIncomeNumerator = modifiedTaxableIncome.times(yearMonths);
  const amtiNumerator = shortPeriodAmti.times(yearMonths);
  const scaledBrackets = taxBrackets[filingStatus].map(bracket => ({
    min: bracket.min.times(months),
    max: bracket.max?.times(months) ?? null,
    rate: bracket.rate,
  }));
  const regularTaxNumerator = calculateUnroundedTaxFromBrackets(regularIncomeNumerator, scaledBrackets);
  const annualizedModifiedTaxableIncome = audit.record(form, "annual-regular-income", "Annualized modified taxable income",
    regularIncomeNumerator.div(months), "Short-period modified taxable income × 12 ÷ months",
    { modifiedTaxableIncome, months });
  const annualRegularTax = audit.record(form, "annual-regular-tax", "Annual ordinary rate-schedule tax",
    regularTaxNumerator.div(months), "IRC §1 rates on the §443(b)(1) annual amount without the §3 tax table",
    { regularIncomeNumerator, months, taxYear: String(taxYear) });
  const regularTax = audit.record(form, "short-regular-tax", "Short-period regular tax",
    regularTaxNumerator.div(yearMonths), "Annual regular tax numerator ÷ 12", { regularTaxNumerator, yearMonths });

  const annualizedAmti = audit.record(form, "annual-amti", "Annualized alternative minimum taxable income",
    amtiNumerator.div(months), "Short-period AMTI × 12 ÷ months", { shortPeriodAmti, months });
  const scaledBaseExemption = amt.exemption[filingStatus].times(months);
  const scaledPhaseOutThreshold = amt.phaseOutThreshold[filingStatus].times(months);
  const reductionNumerator = zeroFloor(amtiNumerator.minus(scaledPhaseOutThreshold)).times(amt.phaseOutRate);
  const exemptionNumerator = zeroFloor(scaledBaseExemption.minus(reductionNumerator));
  const amtExemption = audit.record(form, "amt-exemption", "Annual AMT exemption",
    exemptionNumerator.div(months), "Scaled exemption less scaled reduction, floored at zero, then divided by months",
    { amtiNumerator, scaledBaseExemption, scaledPhaseOutThreshold, phaseOutRate: amt.phaseOutRate, months });
  const amtRateBaseNumerator = zeroFloor(amtiNumerator.minus(exemptionNumerator));
  const amtRateBase = audit.record(form, "amt-rate-base", "Annual taxable excess for minimum tax",
    amtRateBaseNumerator.div(months), "AMTI numerator less exemption numerator, floored at zero, then divided by months",
    { amtiNumerator, exemptionNumerator, months });
  const scaledRate26Limit = amt.rate26Limit[filingStatus].times(months);
  const rate26IncomeNumerator = min(amtRateBaseNumerator, scaledRate26Limit);
  const tentativeMinimumTaxNumerator = rate26IncomeNumerator.times("0.26")
    .plus(amtRateBaseNumerator.minus(rate26IncomeNumerator).times("0.28"));
  const annualTentativeMinimumTax = audit.record(form, "annual-tentative-minimum-tax", "Annual tentative minimum tax",
    tentativeMinimumTaxNumerator.div(months), "26% through the scaled §55 breakpoint and 28% above it, divided by months",
    { amtRateBaseNumerator, scaledRate26Limit, months });
  const tentativeMinimumTax = audit.record(form, "short-tentative-minimum-tax", "Short-period tentative minimum tax",
    tentativeMinimumTaxNumerator.div(yearMonths), "Annual tentative minimum tax numerator ÷ 12",
    { tentativeMinimumTaxNumerator, yearMonths });
  const additionalMinimumTax = audit.record(form, "additional-minimum-tax", "Short-period additional minimum tax",
    zeroFloor(tentativeMinimumTaxNumerator.minus(regularTaxNumerator)).div(yearMonths),
    "Excess of tentative minimum tax numerator over regular tax numerator, divided by 12",
    { tentativeMinimumTaxNumerator, regularTaxNumerator, yearMonths });

  return { annualizedModifiedTaxableIncome, annualRegularTax, regularTax, annualizedAmti, amtExemption, amtRateBase,
    annualTentativeMinimumTax, tentativeMinimumTax, additionalMinimumTax, lines: audit.getLines() };
}
