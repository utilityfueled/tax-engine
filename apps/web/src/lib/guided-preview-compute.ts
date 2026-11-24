/**
 * Heavy preview computation — split from guided-interview-bridge so that the
 * tax engine + decimal.js are only loaded on-demand (dynamic import) instead
 * of being included in the initial client bundle.
 */

import Decimal from "decimal.js";
import { sumAdditionalStateWithholding } from "./guided-state-facts";
import { parseGuidedCurrency } from "./guided-currency";
import { assertSupportedWholeReturnAccountingPeriod } from "./guided-standard-deduction-facts";
import { calculateFederalTax } from "@/engine/federal";
import {calculatePAOrdinaryReturn} from "@/engine/state/pa-ordinary-return";
import { calculatePAOrdinaryReturnFacts } from "@/engine/state/pa-ordinary-return-facts";
import { calculatePAMarriedOrdinaryReturnWithFederal } from "@/engine/state/pa-married-ordinary-return";
import { calculatePAReturn } from "@/engine/state/pa-orchestrator";
import { isPAMarriedOrdinaryReturnResult } from "@/engine/state/pa-return-result";
import { PAMarriedOrdinarySourcesSchema } from "@/models/pa-married-ordinary-sources";
import { assertQofStateMethod } from "@/engine/forms/qof-inclusion";
import { assertClaimOfRightStateMethod } from "@/engine/forms/claim-of-right";
import { canUseOhioEstimatesForScheduleA, canUsePennsylvaniaPaymentsForScheduleA } from "@/engine/forms/state-tax-payment-year";
import { buildOhioResidentReturnInput } from "@/engine/state/oh-input-adapter";
import { calculateOhioResidentReturn } from "@/engine/state/oh-return";
import { buildGuidedOhioOverlay, buildGuidedStateOriginals, readGuidedPAMarriedDraft } from "./guided-state-engine-inputs";
import { buildGuidedOhioPaymentFacts, guidedOhioScheduleAPaymentClaim } from "./guided-ohio-payment-facts";
import { buildGuidedPAMarriedOrdinarySources } from "./guided-pa-married-ordinary-sources";
import {
  calculateGenericStateReturn,
  type GenericStateReturnInput,
  type GenericStateReturnResult,
} from "@/engine/state/generic-resident-return";
import { STATE_CONSTANTS } from "@/models/state-constants";
import { TaxYearInputSchema, type TaxYearInput } from "@/models/inputs";
import type { TaxReturnResult } from "@/models/outputs";
import type { FilingStatus as EngineFilingStatus } from "@/models/constants";
import {
  hasConfirmedPAMarriedFederalOriginals,
  type GuidedFlowState,
  type PersonalInfoData,
  type StateReturnData,
  type W2EntryData,
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

function calculateGuidedPAMarriedPreview(input: TaxYearInput, data: StateReturnData | undefined) {
  const draft = readGuidedPAMarriedDraft(input, data);
  if (!draft) return null;
  // Reconcile a retained canonical packet before replacing it with the current draft.
  // Otherwise the public calculation validates the bound originals in one pass.
  const sources = input.paMarriedOrdinarySources === undefined
    ? PAMarriedOrdinarySourcesSchema.parse(draft)
    : buildGuidedPAMarriedOrdinarySources(input, draft);
  return calculatePAReturn({ ...input, paMarriedOrdinarySources: sources });
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

/** A fresh producer: accepts actual state only, never a caller-prepared input or proof.
 * Returned originals are private source data, not an export or confirmation action. */
export function computeGuidedPreviewEvaluation(state: GuidedFlowState): {preview: ReturnType<typeof computeGuidedPreviewOutcome>; input: TaxYearInput | null; sourceReplaySucceeded: boolean; schoolReplaySucceeded: boolean} {
  let input: TaxYearInput | null = null;
  let sourceReplaySucceeded = false;
  let schoolReplaySucceeded = false;
  let blockedBy: string | null = null;
  const metrics = runGuidedPreview(state, message => { blockedBy = message; },
    current => { input = current; }, () => { sourceReplaySucceeded = true; }, () => { schoolReplaySucceeded = true; }, true);
  return { preview: {metrics, blockedBy}, input, sourceReplaySucceeded, schoolReplaySucceeded };
}

function pendingOhioBusinessHeaderWithoutSchool(input: TaxYearInput, data: StateReturnData | undefined): boolean {
  const header = data?.ohioReturnHeaderSources;
  const residency = data?.ohioResidency;
  return input.taxpayer.taxYear === 2025 && input.taxpayer.filingStatus === "single"
    && input.ohioResidency === undefined && input.ohioSchoolDistrict === undefined && input.ohioReturnHeaderSources === undefined
    && residency?.sourceFactsConfirmed === true && residency.businessSources?.sourceFactsConfirmed === true
    && residency.schoolDistrictStatus === "no_ohio_taxing_district_residency" && residency.residentCreditSources === undefined
    && data?.ohioPayments?.sourceFactsConfirmed === true && data.ohioSchoolDistrict === undefined && data.ohioReciprocalWages === undefined
    && header != null && Object.getOwnPropertyDescriptor(header, "sourceFactsConfirmed")?.value === null
    && header.originalOhioSchoolDistrictSources === undefined;
}

function pendingOhioResidentCreditWithoutSchool(input: TaxYearInput, data: StateReturnData | undefined): boolean {
  const residency = data?.ohioResidency;
  const credit = residency?.residentCreditSources;
  return input.taxpayer.taxYear === 2025 && input.taxpayer.filingStatus === "single"
    && input.ohioResidency === undefined && input.ohioPayments === undefined
    && input.ohioSchoolDistrict === undefined && input.ohioReturnHeaderSources === undefined
    && residency?.businessSources === undefined && residency?.schoolDistrictStatus !== "actual_district_sources_required"
    && data?.ohioSchoolDistrict === undefined && data?.ohioReturnHeaderSources === undefined && data?.ohioReciprocalWages === undefined
    && credit != null && Object.getOwnPropertyDescriptor(credit, "sourceFactsConfirmed")?.value === null;
}

function pendingOhioSchoolDistrictWithoutHeader(input: TaxYearInput, data: StateReturnData | undefined): boolean {
  const school = data?.ohioSchoolDistrict;
  const residency = data?.ohioResidency;
  return input.taxpayer.taxYear === 2025 && input.taxpayer.filingStatus === "single"
    && input.ohioResidency === undefined && input.ohioPayments === undefined
    && input.ohioSchoolDistrict === undefined && input.ohioReturnHeaderSources === undefined
    && residency?.sourceFactsConfirmed === true && residency.schoolDistrictStatus === "actual_district_sources_required"
    && residency.businessSources === undefined && residency.residentCreditSources === undefined
    && data?.ohioPayments?.sourceFactsConfirmed === true
    && data.ohioReturnHeaderSources === undefined && data.ohioReciprocalWages === undefined
    && school != null && Object.getOwnPropertyDescriptor(school, "sourceFactsConfirmed")?.value === null;
}

function runGuidedPreview(state: GuidedFlowState | null | undefined, onBlocked: (message: string) => void,
  onInput?: (input: TaxYearInput) => void, onSourceReplay?: () => void, onSchoolReplay?: () => void,
  renderEvaluation = false): GuidedPreviewMetrics | null {
  if (!state || typeof state !== "object" || state.segmentation == null || state.sectionData == null) {
    return null;
  }

  try {
    const rawInput = buildTaxInputFromGuidedData(state);
    if (!rawInput) return null;
    const baseInput = TaxYearInputSchema.parse(rawInput);
    onInput?.(baseInput);
    let taxInput = baseInput;
    let result: ReturnType<typeof calculateFederalTax>;
    let marriedComposition: ReturnType<typeof calculatePAMarriedOrdinaryReturnWithFederal> | undefined;
    let requiresOhioReplacementSettlement = false;
    try {
      assertSupportedWholeReturnAccountingPeriod(baseInput.standardDeductionFacts);
      const stateData = state.sectionData["state-return"];
      const paymentDraft = stateData?.ohioPayments;
      if (state.segmentation.stateCode === "OH" && canUseOhioEstimatesForScheduleA(baseInput)) {
        const year = baseInput.taxpayer.taxYear;
        const requiresOhioPaymentProof = stateData?.lastConfirmedOHScheduleAPaymentYear === year;
        if (requiresOhioPaymentProof && (paymentDraft?.taxYear !== String(year)
          || paymentDraft.sourceFactsConfirmed !== true || paymentDraft.originalFederalSources == null)) {
          throw new Error("Confirm the complete Ohio prior credit and balance payment records for this year.");
        }
        const ohioPaymentClaim = guidedOhioScheduleAPaymentClaim(paymentDraft, year);
        requiresOhioReplacementSettlement = requiresOhioPaymentProof && ohioPaymentClaim !== "deductible";
        const hasSavedOhioEstimate = baseInput.adjustments?.estimatedTaxPayments.some(payment =>
          payment.type === "state" && payment.state?.trim().toUpperCase() === "OH" && (payment.application?.taxYear ?? year) === year);
        const hasSourcedOhioPayment = paymentDraft && (paymentDraft.sourceFactsConfirmed === true || paymentDraft.originalFederalSources !== undefined)
          && (paymentDraft.paymentRows?.some(row => row?.kind === "estimated") || ohioPaymentClaim);
        if (paymentDraft && (requiresOhioPaymentProof || hasSavedOhioEstimate || hasSourcedOhioPayment)) {
          taxInput = {...baseInput, ohioPayments: buildGuidedOhioPaymentFacts(paymentDraft, baseInput)};
        }
      }
      const pennsylvaniaDraft = stateData?.paOrdinaryReturnFacts;
      if (state.segmentation.stateCode === "PA" && !stateData?.paMarriedOrdinarySources
        && canUsePennsylvaniaPaymentsForScheduleA(baseInput)) {
        const currentYear = baseInput.taxpayer.taxYear;
        const previouslyConfirmedPayments = stateData?.lastConfirmedPAEstimateYear === currentYear;
        if (previouslyConfirmedPayments
          && (pennsylvaniaDraft?.sourceTaxYear !== currentYear || pennsylvaniaDraft.sourceFactsConfirmed !== true
            || pennsylvaniaDraft.originalFederalSources == null)) {
          throw new Error("Confirm complete actual sources for the selected year after editing Pennsylvania payments or the applied refund.");
        }
        const hasPaymentSources = pennsylvaniaDraft?.payments?.priorCredit?.status === "available"
          || pennsylvaniaDraft?.payments?.rows?.some(row => row?.original?.kind === "estimated")
          || stateData?.stateEstimatedPayments?.some(payment => payment.state?.trim().toUpperCase() === "PA");
        if (pennsylvaniaDraft && (pennsylvaniaDraft.sourceFactsConfirmed === true || pennsylvaniaDraft.originalFederalSources !== undefined)
          && (hasPaymentSources || previouslyConfirmedPayments)) {
          taxInput = {
            ...baseInput, paOrdinaryReturnFacts: pennsylvaniaDraft,
            paResidencySources: stateData?.paResidencySources, paReciprocitySources: stateData?.paReciprocitySources,
          };
          // With no payment left to transfer, still replay a retained confirmation
          // before accepting the empty inventory on the preview path.
          if (!hasPaymentSources) calculatePAOrdinaryReturnFacts(taxInput, pennsylvaniaDraft);
        }
      }
      if (state.segmentation.stateCode === "PA") {
        const marriedDraft = stateData?.paMarriedOrdinarySources;
        const canItemize = baseInput.deductionElection !== "standard" && baseInput.deductionElection !== "nonitemized";
        const previouslyConfirmedPayments = canItemize && baseInput.taxpayer.filingStatus === "married_filing_jointly"
          && stateData?.lastConfirmedPAMarriedPaymentYear === baseInput.taxpayer.taxYear;
        if (previouslyConfirmedPayments && !hasConfirmedPAMarriedFederalOriginals(marriedDraft, baseInput.taxpayer.taxYear)) {
          throw new Error("Confirm the Pennsylvania household and its actual payments for this tax year.");
        }
        if (previouslyConfirmedPayments || (marriedDraft?.sourceFactsConfirmed === true && marriedDraft.paymentSources !== undefined)
          || baseInput.paMarriedOrdinarySources?.paymentSources !== undefined) {
          marriedComposition = calculatePAMarriedOrdinaryReturnWithFederal(baseInput, readGuidedPAMarriedDraft(baseInput, stateData));
        }
      }
      result = marriedComposition?.federal ?? calculateFederalTax(taxInput);
    } catch (error) {
      onBlocked(error instanceof Error ? error.message : "This return cannot be figured yet.");
      return null;
    }

    let stateResult: StatePreviewResult | null = null;
    let separateMetrics:StatePreviewMetrics|null=null;
    const stateCode = state.segmentation.stateCode;
    if (stateCode && (stateCode === "OH" || stateCode === "PA" || state.sectionData["personal-info"]?.stateResidency === "full-year")) {
      const personalInfo = state.sectionData["personal-info"] as PersonalInfoData | undefined;
      const depCount = Number(personalInfo?.dependentCount ?? "0");
      if (!state.segmentation.filingStatus) return null;
      const filingStatus = mapFilingStatus(state.segmentation.filingStatus) as EngineFilingStatus;
      const hasSpouse = filingStatus === "married_filing_jointly" || filingStatus === "married_filing_separately";
      const stateWithholding = collectStateWithholding(state, taxInput);

      try {
        assertQofStateMethod(taxInput, stateCode);
        assertClaimOfRightStateMethod(taxInput, stateCode);
        if (stateCode === "PA") {
          const married = marriedComposition?.pennsylvania ?? calculateGuidedPAMarriedPreview(taxInput, state.sectionData["state-return"]);
          if (married && isPAMarriedOrdinaryReturnResult(married)) {
            if (married.filingMode === 'M') {
              separateMetrics = {
                kind: 'separate-returns', stateCode, stateName: 'Pennsylvania',
                returns: married.returns.map(row => {
                  if (row.accountHolder === 'joint') throw Error('Actual M return owner must remain separate');
                  const owner = row.accountHolder === 'primary' ? taxInput.taxpayer.primary : taxInput.taxpayer.spouse;
                  return {
                    accountHolder: row.accountHolder, displayName: owner?.firstName + ' ' + owner?.lastName, filingChoice: 'M',
                    stateTax: row.pa40.taxLiability.toString(), stateRefund: row.refundDisposition.refund.toString(),
                    stateAmountOwed: row.pa40.totalAmountDue.toString(), stateWithholding: row.pa40.totalPayments.toString(),
                  };
                }),
              };
            } else {
              const row = married.returns[0];
              stateResult = {
                stateCode, stateName: 'Pennsylvania', stateTax: row.pa40.netTaxLiability, refund: row.refundDisposition.refund,
                balanceDue: row.pa40.totalAmountDue, totalPayments: row.pa40.totalPayments,
              };
            }
          } else {
            const currentOriginals = buildGuidedStateOriginals(taxInput, state);
            const pa=calculatePAOrdinaryReturn(currentOriginals,currentOriginals.paOrdinaryReturnFacts,currentOriginals.paOrdinaryReturnCompletionSources).pa40;
            stateResult={stateCode,stateName:'Pennsylvania',stateTax:pa.netTaxLiability,refund:pa.netOverpayment,balanceDue:pa.totalAmountDue,totalPayments:pa.totalPayments};
          }
        } else if (stateCode === "OH" && renderEvaluation && (
          pendingOhioBusinessHeaderWithoutSchool(taxInput, state.sectionData["state-return"])
          || pendingOhioResidentCreditWithoutSchool(taxInput, state.sectionData["state-return"])
          || pendingOhioSchoolDistrictWithoutHeader(taxInput, state.sectionData["state-return"])
        )) {
          // These pending drafts cannot produce a state preview. Independent
          // validation still checks their sources and reports incomplete facts.
          stateResult = null;
        } else if (stateCode === "OH") {
          const currentOriginals = buildGuidedStateOriginals(taxInput, state, onSchoolReplay);
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
          const stateEstimatedPayments = (taxInput.adjustments?.estimatedTaxPayments ?? [])
            .filter((payment) => payment.type === "state" && payment.state === stateCode
              && payment.application?.taxYear === taxInput.taxpayer.taxYear)
            .reduce((sum, payment) => sum.plus(payment.amount), new Decimal(0));
          stateResult = tryComputeStatePreview(stateCode, taxInput.taxpayer.taxYear, filingStatus,
            result.agi, result.taxableIncome, Number.isNaN(depCount) ? 0 : depCount,
            hasSpouse, stateWithholding, stateEstimatedPayments);
        }
      } catch (error) {
        if (requiresOhioReplacementSettlement) {
          onBlocked(error instanceof Error ? error.message : "Reconcile the actual Ohio remaining-tax settlement.");
          return null;
        }
        // Keep the federal result while the dedicated state's actual facts need reconciliation.
        stateResult = null;
      }
    }

    if (requiresOhioReplacementSettlement && !stateResult) {
      onBlocked("Reconcile the actual Ohio remaining-tax settlement.");
      return null;
    }
    if (stateResult || separateMetrics) onSourceReplay?.();
    const metrics=extractMetricsFromResult(result,stateResult);
    return separateMetrics?{...metrics,state:separateMetrics}:metrics;
  } catch {
    return null;
  }
}
