import { buildGuidedOhioResidencyFacts } from "./guided-ohio-residency-facts";
import { buildGuidedOhioPaymentFacts } from "./guided-ohio-payment-facts";
import { buildGuidedPAResidencySources } from "./guided-pa-residency-facts";
import { buildGuidedPAReciprocitySources } from "./guided-pa-reciprocity-facts";
import {buildGuidedPAOrdinaryReturnFacts} from "./guided-pa-ordinary-return-facts";
import {buildGuidedPAOrdinaryReturnCompletionSources} from "./guided-pa-ordinary-return-completion";
import Decimal from "decimal.js";
import type { TaxYearInput } from "@/models/inputs";
import { extractOhioWithholding, type OhioOverlayInput } from "@/engine/state/oh-input-adapter";
import type { PAOrchestratorOverrides } from "@/engine/state/pa-orchestrator";
import type { GuidedFlowState, StateReturnData } from "./guided-interview-flow";
import { parseGuidedCurrency } from "./guided-currency";
import { assertKnownFacts } from "./guided-required-facts";
import { statePaymentFactErrors, sumAdditionalStateWithholding } from "./guided-state-facts";
import { ohioInterestFactErrors, requiresOhioInterestAllocation } from "./guided-ohio-interest-facts";

function actualStatePayments(state: GuidedFlowState, code: string): StateReturnData | undefined {
  const data = state.sectionData["state-return"];
  assertKnownFacts(statePaymentFactErrors(data, state.taxYear, code));
  return data;
}
function estimatedPayments(data: StateReturnData): string {
  return data.stateEstimatedPayments.reduce((sum, entry) => sum.plus(parseGuidedCurrency(entry.amount)), new Decimal(0)).toFixed();
}

/** Saved generic rows are retained evidence, never a second source of credit. */
function reconcileSavedStateLedger(data:StateReturnData|undefined,year:number,code:string,receipts:ReadonlyArray<{date:string;amount:string}>):void{
  if(!data)return;
  assertKnownFacts(statePaymentFactErrors(data,year,code));
  if(sumAdditionalStateWithholding(data).gt(0))throw new Error("Actual canonical source forms must reconcile saved additional state withholding; a generic amount cannot override originals.");
  const used=new Set<number>();
  for(const saved of data.stateEstimatedPayments){
    const amount=parseGuidedCurrency(saved.amount);
    const index=receipts.findIndex((actual,index)=>!used.has(index)&&actual.date===saved.date&&new Decimal(actual.amount).eq(amount));
    if(index<0)throw new Error("Reconcile each saved state estimated payment with a distinct actual original receipt or explicitly remove the saved claim.");
    used.add(index);
  }
}

/** The same actual payment overlay is used for the preview and saved review PDF. */
export function buildGuidedOhioOverlay(taxInput: TaxYearInput, state: GuidedFlowState | null | undefined, federalTaxExemptInterest: Decimal): OhioOverlayInput {
  if (!state || state.segmentation.stateCode !== "OH") return {};
  const data = actualStatePayments(state, "OH");
  const allocation = data?.ohioInterestAllocation;
  assertKnownFacts(ohioInterestFactErrors(allocation, state.taxYear,
    requiresOhioInterestAllocation(state.sectionData["income-investments"]), federalTaxExemptInterest));
  const result: OhioOverlayInput = {};
  if (allocation) {
    result.nonOhioStateLocalInterest = parseGuidedCurrency(allocation.nonOhioStateLocalInterest).toFixed();
    result.otherAdditions = parseGuidedCurrency(allocation.federalInterestTaxableByOhio).toFixed();
  }
  if(taxInput.ohioPayments!==undefined||data?.ohioPayments!==undefined){
    if(!taxInput.ohioPayments)throw new Error("Actual canonical Ohio payment sources are required before payment reconciliation.");
    reconcileSavedStateLedger(data,taxInput.taxpayer.taxYear,"OH",taxInput.ohioPayments.paymentRows.filter(row=>row.kind==='estimated'));
    return result;
  }
  if (data?.additionalStateWithholdingEntries?.length) {
    const sourceWithholding = extractOhioWithholding(taxInput.w2s, taxInput.formW2G, taxInput.form1099G,
      taxInput.form1099K, taxInput.form1099R, taxInput.form1099Nec, taxInput.form1099Misc,
      taxInput.form1099Int, taxInput.form1099Div, taxInput.form1099B, taxInput.form1099OID);
    result.ohioWithholdingOverride = sourceWithholding.plus(sumAdditionalStateWithholding(data)).toFixed();
  }
  if (data?.stateEstimatedPayments.length) result.estimatedPayments = estimatedPayments(data);
  return result;
}

export function buildGuidedPennsylvaniaOverrides(state?: GuidedFlowState | null): PAOrchestratorOverrides {
  if (!state || state.segmentation.stateCode !== "PA") return {};
  const data = actualStatePayments(state, "PA");
  if (!data) return {};
  return {
    ...(data.additionalStateWithholdingEntries?.length ? { additionalStateWithholding: sumAdditionalStateWithholding(data) } : {}),
    ...(data.stateEstimatedPayments.length ? { estimatedPayments: new Decimal(estimatedPayments(data)) } : {}),
  };
}

/** Bind current private originals before state calculation and before redaction.
 * This does not turn a source packet into a complete return or filing approval. */
export function buildGuidedStateOriginals(input: TaxYearInput, state?: GuidedFlowState | null): TaxYearInput {
  if (!state) return input;
  const data = state.sectionData["state-return"];
  if (state.segmentation.stateCode === "OH") {
    const ohioResidency = buildGuidedOhioResidencyFacts(data?.ohioResidency, input);
    const ohioPayments = buildGuidedOhioPaymentFacts(data?.ohioPayments, input);
    return {...input, ohioResidency, ohioPayments};
  }
  if (state.segmentation.stateCode === "PA") {
    if (!data?.paResidencySources) throw new Error("Actual Pennsylvania residency sources are required.");
    const bound = data.paReciprocitySources
      ? buildGuidedPAReciprocitySources(input, data.paResidencySources, data.paReciprocitySources)
      : {residencySources:buildGuidedPAResidencySources(input, data.paResidencySources)};
    const current = {...input, paResidencySources:bound.residencySources,
      ...("reciprocitySources" in bound ? {paReciprocitySources:bound.reciprocitySources} : {})};
    // Replays only: no confirmation action and no refreshed snapshot on read.
    const paOrdinaryReturnFacts=buildGuidedPAOrdinaryReturnFacts(current,data.paOrdinaryReturnFacts);
    reconcileSavedStateLedger(data,input.taxpayer.taxYear,"PA",paOrdinaryReturnFacts.payments.rows.filter(row=>row.original.kind==='estimated').map(row=>({date:row.original.date,amount:row.original.amount})));
    const paOrdinaryReturnCompletionSources=buildGuidedPAOrdinaryReturnCompletionSources(current,data.paOrdinaryReturnCompletionSources);
    return {...current,paOrdinaryReturnFacts,paOrdinaryReturnCompletionSources};
  }
  return input;
}
