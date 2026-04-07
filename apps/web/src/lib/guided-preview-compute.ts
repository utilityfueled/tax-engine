/**
 * Heavy preview computation — split from guided-interview-bridge so that the
 * tax engine + decimal.js are only loaded on-demand (dynamic import) instead
 * of being included in the initial client bundle.
 */

import Decimal from "decimal.js";
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
      const val = Number(e.stateWithheld?.trim().replace(/,/g, ""));
      if (!Number.isNaN(val)) total = total.plus(val);
    }
  }

  if (stateReturnData?.additionalStateWithholding) {
    const val = Number(stateReturnData.additionalStateWithholding.trim().replace(/,/g, ""));
    if (!Number.isNaN(val)) total = total.plus(val);
  }

  return total;
}

function collectStateEstimatedPayments(state: GuidedFlowState): Decimal {
  const stateReturnData = state.sectionData["state-return"] as StateReturnData | undefined;
  if (!stateReturnData?.stateEstimatedPayments) return new Decimal(0);

  return stateReturnData.stateEstimatedPayments.reduce((sum, entry) => {
    const val = Number(entry.amount?.trim().replace(/,/g, ""));
    return sum.plus(Number.isNaN(val) ? 0 : val);
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

  const rawInput = buildTaxInputFromGuidedData(state);
  if (!rawInput) return null;

  try {
    const taxInput = TaxYearInputSchema.parse(rawInput);
    const result = calculateFederalTax(taxInput);

    let stateResult: GenericStateReturnResult | null = null;
    const stateCode = state.segmentation.stateCode;
    if (stateCode) {
      const personalInfo = state.sectionData["personal-info"] as PersonalInfoData | undefined;
      const depCount = Number(personalInfo?.dependentCount ?? "0");
      if (!state.segmentation.filingStatus) return null;
      const filingStatus = mapFilingStatus(state.segmentation.filingStatus) as EngineFilingStatus;
      const hasSpouse = filingStatus === "married_filing_jointly" || filingStatus === "married_filing_separately";
      const stateWithholding = collectStateWithholding(state);
      const stateEstimatedPayments = collectStateEstimatedPayments(state);

      stateResult = tryComputeStatePreview(
        stateCode,
        2025,
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
