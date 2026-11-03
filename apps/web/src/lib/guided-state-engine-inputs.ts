import {buildGuidedOhioReciprocalWages} from './guided-oh-reciprocal-wages';
import {buildGuidedOhioSchoolDistrictFacts} from './guided-ohio-school-district-facts';
import {buildGuidedPAMarriedOrdinarySources,assertMarriedPASavedLedger} from './guided-pa-married-ordinary-sources';
import {reconcileGuidedZeroIncomeMiscWithholding}from './guided-zero-income-misc-withholding-reconciliation';
import {ordinarySourcePrecision}from '@/engine/state/pa-ordinary-source-precision';
import {reconcileGuidedRetirementWithholding,type RetirementWithholdingOriginal}from "./guided-retirement-withholding-reconciliation";
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
function reconcileSavedStateLedger(data:StateReturnData|undefined,year:number,code:string,receipts:ReadonlyArray<{date:string;amount:string}>,retirementOriginals?:ReadonlyArray<RetirementWithholdingOriginal>,sourceContext?:{input:TaxYearInput;state:GuidedFlowState}):void{
  if(!data)return;
  assertKnownFacts(statePaymentFactErrors(data,year,code));
  if(sumAdditionalStateWithholding(data).gt(0)){
    const rows=data.additionalStateWithholdingEntries??[],misc=rows.filter(row=>row.documentType==='1099-MISC'),retirement=rows.filter(row=>row.documentType==='1099-R');
    if(rows.some(row=>row.documentType!=='1099-MISC'&&row.documentType!=='1099-R'))throw new Error("Actual canonical source forms must reconcile saved additional state withholding; a generic amount cannot override originals.");
    if(misc.length){
      if(!sourceContext)throw new Error("Actual current finite MISC source context is required.");
      reconcileGuidedZeroIncomeMiscWithholding(sourceContext.input,sourceContext.state,code,misc);
    }
    if(retirement.length){
      if(code!=='PA'||retirementOriginals===undefined)throw new Error("Actual canonical retirement source forms must reconcile saved additional state withholding.");
      const Money=Decimal.clone({precision:ordinarySourcePrecision(data,sourceContext?.input,retirementOriginals),rounding:Decimal.ROUND_HALF_UP});
      const savedRetirement={...data,additionalStateWithholdingEntries:retirement,additionalStateWithholding:retirement.reduce((sum,row)=>sum.plus(parseGuidedCurrency(row.amount)),new Money(0)).toFixed()};
      reconcileGuidedRetirementWithholding(retirementOriginals,savedRetirement,year);
    }
  }
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
    reconcileSavedStateLedger(data,taxInput.taxpayer.taxYear,"OH",taxInput.ohioPayments.paymentRows.filter(row=>row.kind==='estimated'),undefined,{input:taxInput,state});
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
    if(input.ohioResidency?.businessSources&&!data?.ohioResidency?.businessSources)throw Error('Retained actual Ohio business source records require the current native packet and reconfirmation.');
    if(input.ohioResidency?.reciprocalWageSources&&!data?.ohioReciprocalWages)throw new Error('Reconcile the retained canonical reciprocal sources with actual native originals before replacing them.');
    const ohioResidency = data?.ohioReciprocalWages
      ?buildGuidedOhioReciprocalWages(input,data.ohioReciprocalWages,data.ohioResidency,data.ohioPayments)
      :buildGuidedOhioResidencyFacts(data?.ohioResidency, input);
    const ohioPayments = buildGuidedOhioPaymentFacts(data?.ohioPayments, input);
    const ohioSchoolDistrict=ohioResidency.schoolDistrictStatus==='actual_district_sources_required'||data?.ohioSchoolDistrict||input.ohioSchoolDistrict
      ?buildGuidedOhioSchoolDistrictFacts(input,data?.ohioSchoolDistrict,data?.ohioResidency,data?.ohioPayments):undefined;
    return {...input, ohioResidency, ohioPayments,...(ohioSchoolDistrict?{ohioSchoolDistrict}: {})};
  }
  if (state.segmentation.stateCode === "PA") {
    if(data?.paMarriedOrdinarySources!==undefined||input.paMarriedOrdinarySources!==undefined){
      if(!data?.paMarriedOrdinarySources)throw Error('Actual retained married PA household packet must reconcile with the current guide.');
      assertMarriedPASavedLedger(data);
      return{...input,paMarriedOrdinarySources:buildGuidedPAMarriedOrdinarySources(input,data.paMarriedOrdinarySources)};
    }
    if (!data?.paResidencySources) throw new Error("Actual Pennsylvania residency sources are required.");
    const bound = data.paReciprocitySources
      ? buildGuidedPAReciprocitySources(input, data.paResidencySources, data.paReciprocitySources)
      : {residencySources:buildGuidedPAResidencySources(input, data.paResidencySources)};
    const current = {...input, paResidencySources:bound.residencySources,
      ...("reciprocitySources" in bound ? {paReciprocitySources:bound.reciprocitySources} : {})};
    // Replays only: no confirmation action and no refreshed snapshot on read.
    const paOrdinaryReturnFacts=buildGuidedPAOrdinaryReturnFacts(current,data.paOrdinaryReturnFacts);
    reconcileSavedStateLedger(data,input.taxpayer.taxYear,"PA",paOrdinaryReturnFacts.payments.rows.filter(row=>row.original.kind==='estimated').map(row=>({date:row.original.date,amount:row.original.amount})),input.form1099R??[],{input:current,state});
    const paOrdinaryReturnCompletionSources=buildGuidedPAOrdinaryReturnCompletionSources(current,data.paOrdinaryReturnCompletionSources,paOrdinaryReturnFacts);
    return {...current,paOrdinaryReturnFacts,paOrdinaryReturnCompletionSources};
  }
  return input;
}
