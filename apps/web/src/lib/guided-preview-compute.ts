/**
 * Heavy preview computation — split from guided-interview-bridge so that the
 * tax engine + decimal.js are only loaded on-demand (dynamic import) instead
 * of being included in the initial client bundle.
 */

import Decimal from "decimal.js";
import { sumAdditionalStateWithholding } from "./guided-state-facts";
import { parseGuidedCurrency } from "./guided-currency";
import { calculateFederalTax } from "@/engine/federal";
import {calculatePAOrdinaryReturn} from "@/engine/state/pa-ordinary-return";
import { assertQofStateMethod } from "@/engine/forms/qof-inclusion";
import { assertClaimOfRightStateMethod } from "@/engine/forms/claim-of-right";
import { buildOhioResidentReturnInput } from "@/engine/state/oh-input-adapter";
import { calculateOhioResidentReturn } from "@/engine/state/oh-return";
import { buildGuidedOhioOverlay, buildGuidedStateOriginals } from "./guided-state-engine-inputs";
import {
  calculateGenericStateReturn,
  type GenericStateReturnInput,
  type GenericStateReturnResult,
} from "@/engine/state/generic-resident-return";
import { STATE_CONSTANTS } from "@/models/state-constants";
import { TaxYearInputSchema, type TaxYearInput } from "@/models/inputs";
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
  type SchoolDistrictPreviewMetrics,
} from "./guided-interview-bridge";

// ── Helpers ─────────────────────────────────────────────────────────────────

function decimalToString(val: { toString(): string }): string {
  return val.toString();
}

type StatePreviewResult = Pick<GenericStateReturnResult, "stateCode" | "stateName" | "stateTax" | "refund" | "balanceDue" | "totalPayments"> & {schoolDistrict?:SchoolDistrictPreviewMetrics};

function extractStateMetrics(stateResult: StatePreviewResult): StatePreviewMetrics {
  return {
    stateCode: stateResult.stateCode,
    stateName: stateResult.stateName,
    stateTax: decimalToString(stateResult.stateTax),
    stateRefund: decimalToString(stateResult.refund),
    stateAmountOwed: decimalToString(stateResult.balanceDue),
    stateWithholding: decimalToString(stateResult.totalPayments),
    ...(stateResult.schoolDistrict?{schoolDistrict:stateResult.schoolDistrict}: {}),
  };
}

export function extractMetricsFromResult(
  result: TaxReturnResult,
  stateResult?: StatePreviewResult | null,
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

function collectStateWithholding(state: GuidedFlowState, input: TaxYearInput): Decimal {
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
  for (const entry of investments?.oidEntries ?? []) for (const row of entry.stateWithholding ?? []) {
    if (row.state.trim().toUpperCase() === state.segmentation.stateCode?.trim().toUpperCase()) total = total.plus(parseGuidedCurrency(row.stateWithheld));
  }
  const necEntries = state.sectionData["income-self-employment"]?.necEntries ?? [];
  for (const entry of [...investments?.interestEntries ?? [], ...investments?.dividendEntries ?? [], ...investments?.brokerageEntries ?? [], ...investments?.digitalAssetEntries ?? [], ...necEntries, ...state.sectionData["income-retirement"]?.entries ?? [], ...state.sectionData["income-unemployment"]?.entries ?? []]) {
    if (entry.stateTaxReporting === "single" && entry.state?.trim().toUpperCase() === state.segmentation.stateCode?.trim().toUpperCase()) total = total.plus(parseGuidedCurrency(entry.stateWithheld));
  }

  for (const source of input.form1099Misc) {
    if (source.state?.trim().toUpperCase() === state.segmentation.stateCode?.trim().toUpperCase()) total = total.plus(new Decimal(source.stateWithheld));
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
  return computeGuidedPreviewOutcome(state).metrics;
}

/** An engine rejection is a reason to show, unlike missing facts or a schema failure. */
export function computeGuidedPreviewOutcome(state: GuidedFlowState | null | undefined): { metrics: GuidedPreviewMetrics | null; blockedBy: string | null } {
  let blockedBy: string | null = null;
  const metrics = runGuidedPreview(state, message => { blockedBy = message; });
  return { metrics, blockedBy };
}

function runGuidedPreview(state: GuidedFlowState | null | undefined, onBlocked: (message: string) => void): GuidedPreviewMetrics | null {
  if (!state || typeof state !== "object" || state.segmentation == null || state.sectionData == null) {
    return null;
  }

  try {
    const rawInput = buildTaxInputFromGuidedData(state);
    if (!rawInput) return null;
    const taxInput = TaxYearInputSchema.parse(rawInput);
    let result: ReturnType<typeof calculateFederalTax>;
    try {
      result = calculateFederalTax(taxInput);
    } catch (error) {
      onBlocked(error instanceof Error ? error.message : "This return cannot be figured yet.");
      return null;
    }

    let stateResult: StatePreviewResult | null = null;
    const stateCode = state.segmentation.stateCode;
    if (stateCode && (stateCode === "OH" || stateCode === "PA" || state.sectionData["personal-info"]?.stateResidency === "full-year")) {
      const personalInfo = state.sectionData["personal-info"] as PersonalInfoData | undefined;
      const depCount = Number(personalInfo?.dependentCount ?? "0");
      if (!state.segmentation.filingStatus) return null;
      const filingStatus = mapFilingStatus(state.segmentation.filingStatus) as EngineFilingStatus;
      const hasSpouse = filingStatus === "married_filing_jointly" || filingStatus === "married_filing_separately";
      const stateWithholding = collectStateWithholding(state, taxInput);
      const stateEstimatedPayments = collectStateEstimatedPayments(state);

      try {
        assertQofStateMethod(taxInput, stateCode);
        assertClaimOfRightStateMethod(taxInput, stateCode);
        if (stateCode === "PA") {
          const currentOriginals=buildGuidedStateOriginals(taxInput,state);
          const pa=calculatePAOrdinaryReturn(currentOriginals,currentOriginals.paOrdinaryReturnFacts,currentOriginals.paOrdinaryReturnCompletionSources).pa40;
          stateResult = { stateCode, stateName: "Pennsylvania", stateTax: pa.netTaxLiability,
            refund: pa.netOverpayment, balanceDue: pa.totalAmountDue, totalPayments: pa.totalPayments };
        } else if (stateCode === "OH") {
          const currentOriginals = buildGuidedStateOriginals(taxInput, state);
          const ohio = calculateOhioResidentReturn(buildOhioResidentReturnInput(currentOriginals, result, buildGuidedOhioOverlay(currentOriginals, state, result.taxExemptInterest)));
          const oh=ohio.it1040,sd=ohio.sd100,source=ohio.schoolDistrictSource,schoolPacket=currentOriginals.ohioSchoolDistrict;
          if(currentOriginals.ohioSchoolDistrict&&(!sd||!source))throw new Error('Actual required school district result is unavailable.');
          if(sd&&source&&(source.district.districtNumber!=='0302'||!schoolPacket))throw new Error('Verified finite school district review context is unavailable.');
          stateResult = { stateCode, stateName: "Ohio", stateTax: oh.line13_totalLiability,
            refund: oh.line26_refund, balanceDue: oh.line22_totalAmountDue, totalPayments: oh.line17_totalPayments,
            ...(sd&&source&&schoolPacket?{schoolDistrict:{districtCode:'0302',districtName:'Hillsdale LSD',taxYear:schoolPacket.taxYear,taxType:'earned_income' as const,
              earnedIncome:source.residentIncome.line33.toString(),tax:sd.line10_totalLiability.toString(),withholding:sd.line11_sdWithholding.toString(),
              estimatedPayments:schoolPacket.payments.account.estimatedPaymentsCredited,priorCredit:schoolPacket.payments.account.priorCreditApplied,totalPayments:sd.line13_totalPayments.toString(),
              overpayment:sd.line19_overpayment.toString(),outgoingCarryforward:sd.line20_creditCarryforward.toString(),refund:sd.line21_refund.toString(),amountOwed:sd.line18_totalAmountDue.toString()}}: {}) };
        } else {
          stateResult = tryComputeStatePreview(stateCode, taxInput.taxpayer.taxYear, filingStatus,
            result.agi, result.taxableIncome, Number.isNaN(depCount) ? 0 : depCount,
            hasSpouse, stateWithholding, stateEstimatedPayments);
        }
      } catch {
        // Keep the federal result while the dedicated state's actual facts need reconciliation.
        stateResult = null;
      }
    }

    return extractMetricsFromResult(result, stateResult);
  } catch {
    return null;
  }
}
