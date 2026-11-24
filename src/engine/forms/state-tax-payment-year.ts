/** ScheduleA line5a cash-payment year; spec/federal/schedule-a.yaml. */
import Decimal from "decimal.js";
import type {TaxYearInput} from "@/models/inputs.js";
import {d} from "@/utils/decimal.js";
import {buildOhioPaymentSource} from "../state/oh-payment-source.js";
import {calculatePAOrdinaryReturnFacts} from "../state/pa-ordinary-return-facts.js";

type Estimate = NonNullable<TaxYearInput["adjustments"]>["estimatedTaxPayments"][number];
type ActualEstimate = Pick<Estimate,"date"|"amount">;

export function canUseOhioEstimatesForScheduleA(input:TaxYearInput):boolean {
  return input.taxpayer.taxYear===2025 && input.deductionElection!=="standard" && input.deductionElection!=="nonitemized";
}

export function canUsePennsylvaniaEstimatesForScheduleA(input:TaxYearInput):boolean {
  const {taxpayer,deductionElection,paMarriedOrdinarySources}=input;
  return taxpayer.taxYear===2025 && !taxpayer.spouse && !paMarriedOrdinarySources
    && taxpayer.filingStatus!=="married_filing_jointly" && taxpayer.filingStatus!=="married_filing_separately"
    && deductionElection!=="standard" && deductionElection!=="nonitemized";
}

function ohioEstimatedPaymentOriginals(input:TaxYearInput) {
  const packet=input.ohioPayments;
  if(!packet || !canUseOhioEstimatesForScheduleA(input)) return undefined;
  const savedOhioEstimate=input.adjustments?.estimatedTaxPayments.some(payment=>payment.type==="state" && payment.state?.trim().toUpperCase()==="OH");
  if(!savedOhioEstimate && !packet.paymentRows.some(row=>row.kind==="estimated")) return undefined;

  const {facts}=buildOhioPaymentSource(input,packet);
  const confirmations=new Set<string>();
  const confirmationKey=(receipt:{accountSsn:string;confirmationNumber:string})=>
    `${receipt.accountSsn.replace(/[\s-]/g,"")}:${receipt.confirmationNumber.trim().toUpperCase()}`;
  if(facts.remainingTaxPayment.status==="actual_payment") confirmations.add(confirmationKey(facts.remainingTaxPayment.original));
  for(const row of facts.paymentRows){
    const key=confirmationKey(row.original);
    if(confirmations.has(key)) throw new Error("Ohio payment originals require distinct actual receipt confirmations.");
    confirmations.add(key);
  }
  const estimates=facts.paymentRows.filter(row=>row.kind==="estimated");
  if(d(input.scheduleA?.additionalStateLocalIncomeTaxes).gt(0)
    && estimates.some(row=>row.date.startsWith(`${facts.taxYear}-`) && d(row.amount).gt(0))) {
    throw new Error("Reconcile the additional state and local income tax total with the Ohio estimated payment receipts. Separate payments need their own dated records.");
  }
  return estimates;
}

function pennsylvaniaEstimatedPaymentOriginals(input:TaxYearInput):ActualEstimate[]|undefined {
  const packet=input.paOrdinaryReturnFacts;
  if(!packet || !canUsePennsylvaniaEstimatesForScheduleA(input)) return undefined;
  const year=input.taxpayer.taxYear;
  const hasSavedEstimate=input.adjustments?.estimatedTaxPayments.some(payment=>payment.type==="state"
    && payment.state?.trim().toUpperCase()==="PA" && (payment.application?.taxYear ?? year)===year);
  if(!hasSavedEstimate && !packet.payments.rows.some(row=>row.original.kind==="estimated")) return undefined;

  const {facts}=calculatePAOrdinaryReturnFacts(input,packet);
  const estimates=facts.payments.rows.filter(row=>row.original.kind==="estimated").map(row=>row.original);
  if(d(input.scheduleA?.additionalStateLocalIncomeTaxes).gt(0)
    && estimates.some(row=>row.date.startsWith(`${year}-`) && d(row.amount).gt(0))) {
    throw new Error("Reconcile the additional state and local income tax total with the Pennsylvania estimated payment receipts. Separate payments need their own dated records.");
  }
  return estimates;
}

function removeSavedMirrors(estimates:Estimate[], originals:ActualEstimate[], stateCode:"OH"|"PA", appliedYear?:number):Estimate[] {
  const stateName=stateCode==="OH" ? "Ohio" : "Pennsylvania";
  const used=new Set<number>();
  return estimates.filter(payment=>{
    if(payment.type!=="state") return true;
    const state=payment.state?.trim().toUpperCase();
    if(!state) throw new Error(`Identify the jurisdiction of each saved state estimated payment before reconciling ${stateName} originals.`);
    if(state!==stateCode || (appliedYear!==undefined && payment.application && payment.application.taxYear!==appliedYear)) return true;
    const match=originals.findIndex((row,index)=>!used.has(index) && row.date===payment.date && d(row.amount).eq(payment.amount));
    if(match<0) throw new Error(`Reconcile each saved ${stateName} estimated payment with a distinct actual original receipt.`);
    used.add(match);
    return false;
  });
}

export function calculateStateTaxPaymentsInYear(input:TaxYearInput):Decimal {
  const year=input.taxpayer.taxYear;
  const ohioOriginals=ohioEstimatedPaymentOriginals(input);
  const pennsylvaniaOriginals=pennsylvaniaEstimatedPaymentOriginals(input);
  let estimates=input.adjustments?.estimatedTaxPayments ?? [];
  // Older saved estimates have no confirmation number. Reconcile mirrors by
  // date and exact amount, then use each jurisdiction's actual receipt ledger.
  if(ohioOriginals) estimates=removeSavedMirrors(estimates,ohioOriginals,"OH");
  if(pennsylvaniaOriginals) estimates=removeSavedMirrors(estimates,pennsylvaniaOriginals,"PA",year);
  let total=d(0);
  const originalEstimates=[...(ohioOriginals??[]),...(pennsylvaniaOriginals??[])].map(({date,amount})=>({date,amount,type:"state" as const}));
  for(const payment of [...estimates,...(input.adjustments?.extensionPayments ?? []),...originalEstimates]) {
    if(payment.type!=="state") continue;
    const parsed=/^\d{4}-\d{2}-\d{2}$/.test(payment.date) ? new Date(`${payment.date}T00:00:00Z`) : undefined;
    if(!parsed || !Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0,10)!==payment.date) throw new Error("State tax deduction requires actual valid payment date");
    const amount=d(payment.amount);
    if(!amount.isFinite() || amount.lt(0)) throw new Error("State tax payment must be finite and nonnegative");
    if(parsed.getUTCFullYear()===year) total=total.plus(amount);
  }
  for(const credit of input.adjustments?.priorYearAppliedCredits ?? []) {
    if(credit.type!=="state") continue;
    if(credit.sourceTaxYear!==year-1) throw new Error("State applied credit source year must be the immediately prior return year");
    const amount=d(credit.amount);
    if(!amount.isFinite() || amount.lt(0)) throw new Error("State applied credit must be finite and nonnegative");
    total=total.plus(amount);
  }
  return total;
}
