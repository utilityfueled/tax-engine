/**
 * Heavy preview computation — split from guided-interview-bridge so that the
 * tax engine + decimal.js are only loaded on-demand (dynamic import) instead
 * of being included in the initial client bundle.
 */

import Decimal from "decimal.js";
import { sumAdditionalStateWithholding } from "./guided-state-facts";
import { parseGuidedCurrency } from "./guided-currency";
import { calculateFederalTax } from "@/engine/federal";
import {
  calculateGenericStateReturn,
  type GenericStateReturnInput,
  type GenericStateReturnResult,
} from "@/engine/state/generic-resident-return";
import { STATE_CONSTANTS } from "@/models/state-constants";
import { TaxYearInputSchema } from "@/models/inputs";
import type { TaxReturnResult } from "@/models/outputs";
import type { FilingStatus as EngineFilingStatus } from "@/models/constants";
import type {
  GuidedFlowState,
  PersonalInfoData,
  StateReturnData,
  W2EntryData,
} from "./guided-interview-flow";
import {
  buildTaxInputFromGuidedData,
  mapFilingStatus,
  type GuidedPreviewMetrics,
  type StatePreviewMetrics,
} from "./guided-interview-bridge";

// ── Helpers ─────────────────────────────────────────────────────────────────

function decimalToString(val: { toString(): string }): string {
  return val.toString();
}

function extractStateMetrics(stateResult: GenericStateReturnResult): StatePreviewMetrics {
  return {
    stateCode: stateResult.stateCode,
    stateName: stateResult.stateName,
    stateTax: decimalToString(stateResult.stateTax),
    stateRefund: decimalToString(stateResult.refund),
    stateAmountOwed: decimalToString(stateResult.balanceDue),
    stateWithholding: decimalToString(stateResult.totalPayments),
  };
}

export function extractMetricsFromResult(
  result: TaxReturnResult,
  stateResult?: GenericStateReturnResult | null,
): GuidedPreviewMetrics {
  return {
    totalIncome: decimalToString(result.totalIncome),
    agi: decimalToString(result.agi),
    taxableIncome: decimalToString(result.taxableIncome),
    totalTax: decimalToString(result.totalTax),
    totalPayments: decimalToString(result.totalPayments),
    refund: decimalToString(result.refund),
    amountOwed: decimalToString(result.amountOwed),
    selfEmploymentTax: decimalToString(result.selfEmploymentTax),
    additionalMedicareTax: decimalToString(result.additionalMedicareTax),
    netInvestmentIncomeTax: decimalToString(result.niitTax),
    state: stateResult ? extractStateMetrics(stateResult) : null,
  };
}

// ── State withholding / estimated payments ──────────────────────────────────

function collectStateWithholding(state: GuidedFlowState): Decimal {
  const w2Data = state.sectionData["income-w2"] as { entries: W2EntryData[] } | undefined;
  const stateReturnData = state.sectionData["state-return"] as StateReturnData | undefined;

  let total = new Decimal(0);

  if (w2Data?.entries) {
    for (const e of w2Data.entries) {
      if (e.stateTaxReporting === "single" && e.state?.trim().toUpperCase() === state.segmentation.stateCode?.trim().toUpperCase()
        && e.aiSuggestedFields?.stateWithheld?.status !== "pending-confirmation" && e.aiSuggestedFields?.state?.status !== "pending-confirmation") total = total.plus(parseGuidedCurrency(e.stateWithheld));
    }
  }

  const investments = state.sectionData["income-investments"];
  const necEntries = state.sectionData["income-self-employment"]?.necEntries ?? [];
  for (const entry of [...investments?.interestEntries ?? [], ...investments?.dividendEntries ?? [], ...investments?.brokerageEntries ?? [], ...necEntries]) {
    if (entry.stateTaxReporting === "single" && entry.state?.trim().toUpperCase() === state.segmentation.stateCode?.trim().toUpperCase()) total = total.plus(parseGuidedCurrency(entry.stateWithheld));
  }

  total = total.plus(sumAdditionalStateWithholding(stateReturnData));

  return total;
}

function collectStateEstimatedPayments(state: GuidedFlowState): Decimal {
  const stateReturnData = state.sectionData["state-return"] as StateReturnData | undefined;
  if (!stateReturnData?.stateEstimatedPayments) return new Decimal(0);

  return stateReturnData.stateEstimatedPayments.reduce((sum, entry) => {
    return sum.plus(parseGuidedCurrency(entry.amount));
  }, new Decimal(0));
}

// ── State preview ───────────────────────────────────────────────────────────

function tryComputeStatePreview(
  stateCode: string,
  taxYear: number,
  filingStatus: EngineFilingStatus,
  federalAGI: Decimal,
  federalTaxableIncome: Decimal,
  dependentCount: number,
  hasSpouse: boolean,
  stateWithholding: Decimal,
  stateEstimatedPayments: Decimal,
): GenericStateReturnResult | null {
  if (!STATE_CONSTANTS[stateCode]?.[taxYear]) return null;

  try {
    const stateInput: GenericStateReturnInput = {
      stateCode,
      taxYear,
      filingStatus,
      federalAGI,
      federalTaxableIncome,
      dependentCount,
      hasSpouse,
      stateWithholding,
      stateEstimatedPayments,
    };
    return calculateGenericStateReturn(stateInput);
  } catch {
    return null;
  }
}

// ── Main preview computation ────────────────────────────────────────────────

export function computeGuidedPreview(state: GuidedFlowState | null | undefined): GuidedPreviewMetrics | null {
  if (!state || typeof state !== "object" || state.segmentation == null || state.sectionData == null) {
    return null;
  }

  try {
    const rawInput = buildTaxInputFromGuidedData(state);
    if (!rawInput) return null;
    const taxInput = TaxYearInputSchema.parse(rawInput);
    const result = calculateFederalTax(taxInput);

    let stateResult: GenericStateReturnResult | null = null;
    const stateCode = state.segmentation.stateCode;
    if (stateCode && state.sectionData["personal-info"]?.stateResidency === "full-year") {
      const personalInfo = state.sectionData["personal-info"] as PersonalInfoData | undefined;
      const depCount = Number(personalInfo?.dependentCount ?? "0");
      if (!state.segmentation.filingStatus) return null;
      const filingStatus = mapFilingStatus(state.segmentation.filingStatus) as EngineFilingStatus;
      const hasSpouse = filingStatus === "married_filing_jointly" || filingStatus === "married_filing_separately";
      const stateWithholding = collectStateWithholding(state);
      const stateEstimatedPayments = collectStateEstimatedPayments(state);

      stateResult = tryComputeStatePreview(
        stateCode,
        taxInput.taxpayer.taxYear,
        filingStatus,
        result.agi,
        result.taxableIncome,
        Number.isNaN(depCount) ? 0 : depCount,
        hasSpouse,
        stateWithholding,
        stateEstimatedPayments,
      );
    }

    return extractMetricsFromResult(result, stateResult);
  } catch {
    return null;
  }
}
