import Decimal from "decimal.js";
import { TaxYearInputSchema, TaxableStateRefundYearSchema, TaxableStateRefundRecoveriesSchema, type Form1099G, type TaxYearInput, type TaxableStateRefundYearInput } from "@/models/inputs";
import { calculateTaxableStateRefundRecoveries } from "@/engine/forms/taxable-state-refund-recoveries";
import type { GuidedFlowState } from "./guided-interview-flow";
import { guidedSourceValuesChanged } from "./guided-source-confirmation";

export interface GuidedRefundPaymentData {
  sourceReference?: string; datePaid?: string; amount?: string;
  currentYearStatePaymentConfirmed?: boolean | null;
}
export interface GuidedRefundPaymentBasisData {
  sourceReference?: string; receivedDate?: string; state?: string;
  sourceFactsConfirmed?: boolean | null; allPaymentsForStateReturnIncludedConfirmed?: boolean | null;
  payments?: GuidedRefundPaymentData[];
}
export type GuidedRefundYearData = Omit<TaxableStateRefundYearInput, "priorTaxYear" | "sourceFactsConfirmed"> & {
  priorTaxYear?: string; sourceFactsConfirmed?: boolean | null;
};
export interface GuidedRefundRecoveryOriginals {
  taxpayer: TaxYearInput["taxpayer"]; forms: Form1099G[];
  adjustments: TaxYearInput["adjustments"];
}
export interface GuidedRefundRecoveriesData {
  sourceTaxYear?: string; sourceReference?: string;
  sourceFactsConfirmed?: boolean | null; allRefundSourcesIncludedConfirmed?: boolean | null;
  years?: GuidedRefundYearData[];
  originalSources?: GuidedRefundRecoveryOriginals;
  originalDraft?: ReturnType<typeof refundRecoveryDraft>;
}
export const refundHistoryAmounts = [
  ["priorYearItemizedTotal","Historical total itemized deductions"],
  ["priorYearStandardDeduction","Historical available standard deduction"],
  ["priorYearStateLocalTaxesPaid","Historical state and local income taxes paid"],
  ["priorYearPropertyTaxesPaid","Historical property taxes paid"],
  ["priorYearAlternativeGeneralSalesTaxDeduction","Historical alternative general sales tax deduction"],
  ["priorYearSaltDeduction","Historical actual Schedule A tax deduction"],
  ["priorYearOtherItemizedDeductions","Historical other itemized deductions"],
  ["priorYearAdjustedGrossIncome","Historical adjusted gross income"],
  ["priorYearTaxableIncome","Historical taxable income"],
  ["priorYearAdditionalDeductions","Historical additional below-AGI deductions"],
] as const;
export const refundHistoryExclusions = [
  ["priorYearHadAMT","Historical AMT"], ["priorYearHadUnusedTaxCredits","Historical unused tax credits"],
  ["priorYearHadTaxCredits","Historical tax credits"], ["priorYearUsedSpecialTaxComputation","Historical special tax computation"],
  ["priorYearUsedPreferentialTaxWorksheet","Historical capital-rate worksheet"], ["priorYearWasDependent","Historical dependent status"],
  ["priorYearNonresidentAlien","Historical nonresident alien status"], ["priorYearHadCarryoverBenefits","Historical carryover benefits"],
  ["priorYearHadOtherRecoveries","Other recoveries from this deduction year"], ["priorYearHadEarlierRefunds","Earlier refunds of this deduction"],
  ["priorYearBlind","Historical blindness"], ["priorYearDeceased","Historical death"],
  ["priorYearMandatoryItemization","Historical mandatory itemization"], ["communityPropertyAllocationRequired","Community-property allocation required"],
] as const;

/** Preserve original monetary lexemes; no absent amount or answer becomes zero. */
export function buildGuidedRefundPaymentBasis(data: GuidedRefundPaymentBasisData | undefined): Form1099G["refundPaymentBasis"] {
  if (!data) return undefined;
  return { sourceReference:data.sourceReference,receivedDate:data.receivedDate,state:data.state,
    sourceFactsConfirmed:data.sourceFactsConfirmed ?? undefined,
    allPaymentsForStateReturnIncludedConfirmed:data.allPaymentsForStateReturnIncludedConfirmed ?? undefined,
    payments:data.payments?.map(row=>({sourceReference:row.sourceReference,datePaid:row.datePaid,amount:row.amount})),
  };
}
function facts(data: GuidedRefundRecoveriesData | undefined) {
  if (!data) return undefined;
  const { originalSources:_sources,originalDraft:_draft,sourceFactsConfirmed:_confirmed,...values }=data;
  return values;
}
export function refundRecoveryDraft(state: GuidedFlowState) {
  return { taxYear:state.taxYear,filingStatus:state.segmentation.filingStatus,
    personal:state.sectionData["personal-info"],entries:state.sectionData["income-unemployment"]?.entries,
    facts:facts(state.sectionData["income-unemployment"]?.refundRecoveries),
    statePayments:state.sectionData["state-return"]?.stateEstimatedPayments,
    federalPayments:state.sectionData.payments, deductions:state.sectionData.deductions,
  };
}
const stable=(value:unknown):unknown=>Array.isArray(value)?value.map(stable):value!==null&&typeof value==="object"
  ?Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([key,item])=>[key,stable(item)])):value;
const same=(a:unknown,b:unknown)=>JSON.stringify(stable(a))===JSON.stringify(stable(b));
function cohort(state:GuidedFlowState):void {
  const data=state.sectionData["income-unemployment"];
  if(state.taxYear!==2025||state.segmentation.filingStatus!=="single")throw new Error("Native payment-year recovery currently requires an actual2025 single-owner return.");
  const person=state.sectionData["personal-info"];
  if(!person?.dateOfBirth||person.dateOfBirth<="1961-01-01")throw new Error("Native recovery requires actual under65 historical/current birth-date facts.");
  if(!data?.refundRecoveries||data.taxRefund)throw new Error("Payment-year collection and the legacy single-year refund worksheet are mutually exclusive.");
}
function prepare(raw:unknown,state:GuidedFlowState):TaxYearInput {
  cohort(state);
  // Canonical wire input omits undefined object keys, exactly as local save/recovery does.
  // Raw draft blanks, null answers and original lexemes remain in originalDraft.
  const input=TaxYearInputSchema.parse(JSON.parse(JSON.stringify(raw))),entries=(state.sectionData["income-unemployment"]?.entries??[]).filter(entry=>Object.values(entry).some(value=>typeof value==="string"?value.trim()!=="":typeof value==="boolean"));
  if(input.taxpayer.stateResidency===undefined)throw new Error("Confirm actual current residency before capturing refund originals.");
  const forms=input.form1099G?.map((form,index)=>{
    const draft=entries[index]?.refundPaymentBasis;
    if(!draft)return form;
    const basis=form.refundPaymentBasis;
    if(!basis?.payments)throw new Error("Enter the complete actual dated refund payment basis.");
    return {...form,refundPaymentBasis:{...basis,payments:basis.payments.map((payment,i)=>{
      const link=draft.payments?.[i]?.currentYearStatePaymentConfirmed;
      if(typeof link!=="boolean")throw new Error("Confirm whether each original payment is also a current-year state estimated payment.");
      const current=payment.datePaid?.startsWith("2025-")===true;
      if(link!==current)throw new Error("Reconcile actual historical/current payment years and current payment ownership.");
      if(!current)return payment;
      const matches=(input.adjustments?.estimatedTaxPayments??[]).flatMap((actual,index)=>
        actual.type==="state"&&actual.state===basis.state&&actual.date===payment.datePaid&&actual.amount===payment.amount?[index]:[]);
      if(matches.length!==1)throw new Error("Record and uniquely reconcile this exact current state estimated payment in State Return first.");
      return {...payment,currentYearPayment:{collection:"estimatedTaxPayments" as const,index:matches[0]}};
    })}};
  });
  return TaxYearInputSchema.parse({...input,form1099G:forms});
}
/** User-triggered copy only. Never invoked by ordinary build, blur, save or recovery. */
export function captureGuidedRefundRecoveryOriginals(raw:unknown,state:GuidedFlowState) {
  const input=prepare(raw,state);
  return {originalSources:structuredClone({taxpayer:input.taxpayer,forms:input.form1099G??[],adjustments:input.adjustments}),
    originalDraft:structuredClone(refundRecoveryDraft(state))};
}
export function guidedRefundRecoveryDraftErrors(state:GuidedFlowState):Record<string,string> {
  const data=state.sectionData["income-unemployment"]?.refundRecoveries;
  if(!data)return {};
  try {
    cohort(state);
    if(data.sourceTaxYear!=="2025"||!data.sourceReference?.trim()||data.sourceFactsConfirmed!==true||data.allRefundSourcesIncludedConfirmed!==true)
      throw new Error("Confirm the actual recovery collection year, original reference and complete inventory after the last edit.");
    const year=data.years?.[0];
    if(data.years?.length!==1||year?.priorTaxYear!=="2024"||year.sourceFactsConfirmed!==true||!year.sourceReference?.trim()||year.priorYearFilingStatus!=="single"||year.priorYearPrimarySsn!==state.sectionData["personal-info"]?.ssn||typeof year.priorYearItemized!=="boolean"||(year.priorYearItemized&&!["income","sales"].includes(year.priorYearStateLocalTaxElection??"")))throw new Error("Enter and confirm the actual 2024 same-owner historical return and tax election.");
    if(refundHistoryAmounts.some(([key])=>typeof year[key]!=="string"||!/^\d{1,12}(?:\.\d{1,2})?$/.test(year[key]??""))||refundHistoryExclusions.some(([key])=>year[key]!==false))throw new Error("Historical amounts and each excluded tax-benefit treatment must be explicitly known for this finite route.");
    if(!data.originalSources||!data.originalDraft||!same(data.originalDraft,refundRecoveryDraft(state)))
      throw new Error("Capture the current original household, statements, payment basis and historical facts explicitly; saved originals are stale or missing.");
    return {};
  }catch(error){return {refundRecoveries:error instanceof Error?error.message:"Complete the actual original recovery collection."};}
}
export function bindGuidedRefundRecoveryInput(raw:unknown,state:GuidedFlowState):TaxYearInput {
  const errors=guidedRefundRecoveryDraftErrors(state);if(Object.keys(errors).length)throw new Error(Object.values(errors)[0]);
  const input=prepare(raw,state),data=state.sectionData["income-unemployment"]?.refundRecoveries;
  if(!data?.originalSources)throw new Error("Capture the original refund collection first.");
  if(!same(data.originalSources,{taxpayer:input.taxpayer,forms:input.form1099G??[],adjustments:input.adjustments}))throw new Error("Current canonical refund originals or payment identities differ from the captured source.");
  if(data.years?.length!==1||data.years[0].priorTaxYear!=="2024")throw new Error("Native recovery requires exactly one actual2024 historical worksheet.");
  const years=data.years.map(row=>TaxableStateRefundYearSchema.parse({...row,priorTaxYear:Number(row.priorTaxYear),sourceFactsConfirmed:row.sourceFactsConfirmed??undefined}));
  const packet=TaxableStateRefundRecoveriesSchema.parse({methodVersion:"state-income-tax-recoveries-v1",sourceTaxYear:2025,sourceReference:data.sourceReference,
    sourceFactsConfirmed:data.sourceFactsConfirmed,allRefundSourcesIncludedConfirmed:data.allRefundSourcesIncludedConfirmed,
    originalTaxpayer:data.originalSources.taxpayer,sourceOriginals:data.originalSources.forms.filter(original=>original.refundPaymentBasis!==undefined||Decimal.max(new Decimal(original.stateOrLocalTaxRefund??0),new Decimal(original.stateLocalIncomeTaxRefund??0)).gt(0)).map(original=>({sourceId:original.sourceId,original})),years});
  const bound=TaxYearInputSchema.parse({...input,taxableStateRefundRecoveries:packet});
  calculateTaxableStateRefundRecoveries(bound);
  return bound;
}
export function updateGuidedRefundRecoveries(previous:GuidedRefundRecoveriesData,patch:Partial<GuidedRefundRecoveriesData>):GuidedRefundRecoveriesData {
  const next={...previous,...patch};return guidedSourceValuesChanged(previous,next)?{...next,sourceFactsConfirmed:null}:next;
}
