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

export function canUsePennsylvaniaPaymentsForScheduleA(input:TaxYearInput):boolean {
  const {taxpayer,deductionElection,paMarriedOrdinarySources}=input;
  return taxpayer.taxYear===2025 && !taxpayer.spouse && !paMarriedOrdinarySources
    && taxpayer.filingStatus!=="married_filing_jointly" && taxpayer.filingStatus!=="married_filing_separately"
    && deductionElection!=="standard" && deductionElection!=="nonitemized";
}

function ohioPaymentOriginals(input:TaxYearInput) {
  const packet=input.ohioPayments;
  if(!packet || !canUseOhioEstimatesForScheduleA(input)) return undefined;
  const year=input.taxpayer.taxYear;
  const inCashYear=(row:ActualEstimate)=>row.date.startsWith(`${year}-`) && d(row.amount).gt(0);
  const savedOhioEstimate=input.adjustments?.estimatedTaxPayments.some(payment=>payment.type==="state"
    && payment.state?.trim().toUpperCase()==="OH" && (payment.application?.taxYear ?? year)===year);
  const savedOhioCredit=input.adjustments?.priorYearAppliedCredits.some(credit=>credit.type==="state" && credit.state?.trim().toUpperCase()==="OH");
  const payoff=packet.remainingTaxPayment;
  if(!savedOhioEstimate && !savedOhioCredit && packet.priorCreditCarryforward?.status!=="actual_credit"
    && !(payoff?.status==="actual_payment" && inCashYear({date:payoff.date,amount:payoff.amountAppliedToTax}))
    && !packet.paymentRows.some(row=>row.kind==="estimated" || inCashYear(row))) return undefined;

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
  if(facts.paymentRows.some(row=>row.kind==="extension" && inCashYear(row))) {
    throw new Error("The actual Ohio extension receipt needs verified income tax principal for Schedule A.");
  }
  const priorCredit=d(facts.priorCreditCarryforward.status==="actual_credit" ? facts.priorCreditCarryforward.availableForThisReturn : 0);
  const remaining=facts.remainingTaxPayment;
  const balance=remaining.status==="actual_payment" ? {date:remaining.date,amount:remaining.amountAppliedToTax} : undefined;
  const balanceInYear=balance && inCashYear(balance) ? balance : undefined;
  if(d(input.scheduleA?.additionalStateLocalIncomeTaxes).gt(0)) {
    if(estimates.some(inCashYear)) {
      throw new Error("Reconcile the additional state and local income tax total with the Ohio estimated payment receipts. Separate payments need their own dated records.");
    }
    if(priorCredit.gt(0) || balanceInYear) {
      throw new Error("Reconcile the additional state and local income tax total with the Ohio payment originals. Separate payments need their own dated records.");
    }
  }
  return {estimates,priorCredit,balance:balanceInYear,verifyEstimateMirrors:savedOhioEstimate || estimates.length>0};
}

function pennsylvaniaPaymentOriginals(input:TaxYearInput) {
  const packet=input.paOrdinaryReturnFacts;
  if(!packet || !canUsePennsylvaniaPaymentsForScheduleA(input)) return undefined;
  const year=input.taxpayer.taxYear;
  const hasSavedEstimate=input.adjustments?.estimatedTaxPayments.some(payment=>payment.type==="state"
    && payment.state?.trim().toUpperCase()==="PA" && (payment.application?.taxYear ?? year)===year);
  const hasSavedCredit=input.adjustments?.priorYearAppliedCredits.some(credit=>credit.type==="state"
    && credit.state?.trim().toUpperCase()==="PA");
  if(!hasSavedEstimate && !hasSavedCredit && packet.payments.priorCredit.status!=="available"
    && !packet.payments.rows.some(row=>row.original.kind==="estimated")) return undefined;

  const {facts,priorCreditCarryforward}=calculatePAOrdinaryReturnFacts(input,packet);
  const estimates=facts.payments.rows.filter(row=>row.original.kind==="estimated").map(row=>row.original);
  if(d(input.scheduleA?.additionalStateLocalIncomeTaxes).gt(0)
    && (priorCreditCarryforward.gt(0) || estimates.some(row=>row.date.startsWith(`${year}-`) && d(row.amount).gt(0)))) {
    throw new Error("Reconcile the additional state and local income tax total with the Pennsylvania payment originals. Separate payments need their own records.");
  }
  return {estimates,priorCredit:priorCreditCarryforward,verifyEstimateMirrors:hasSavedEstimate || estimates.length>0};
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
  const ohioOriginals=ohioPaymentOriginals(input);
  const pennsylvaniaOriginals=pennsylvaniaPaymentOriginals(input);
  let estimates=input.adjustments?.estimatedTaxPayments ?? [];
  // Older saved estimates have no confirmation number. Reconcile mirrors by
  // date and exact amount, then use each jurisdiction's actual receipt ledger.
  if(ohioOriginals?.verifyEstimateMirrors) estimates=removeSavedMirrors(estimates,ohioOriginals.estimates,"OH",year);
  if(pennsylvaniaOriginals?.verifyEstimateMirrors) estimates=removeSavedMirrors(estimates,pennsylvaniaOriginals.estimates,"PA",year);
  let total=d(pennsylvaniaOriginals?.priorCredit).plus(d(ohioOriginals?.priorCredit));
  const originalPayments=[...(ohioOriginals?.estimates??[]),...(pennsylvaniaOriginals?.estimates??[]),...(ohioOriginals?.balance ? [ohioOriginals.balance] : [])]
    .map(({date,amount})=>({date,amount,type:"state" as const}));
  for(const payment of [...estimates,...(input.adjustments?.extensionPayments ?? []),...originalPayments]) {
    if(payment.type!=="state") continue;
    const parsed=/^\d{4}-\d{2}-\d{2}$/.test(payment.date) ? new Date(`${payment.date}T00:00:00Z`) : undefined;
    if(!parsed || !Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0,10)!==payment.date) throw new Error("State tax deduction requires actual valid payment date");
    const amount=d(payment.amount);
    if(!amount.isFinite() || amount.lt(0)) throw new Error("State tax payment must be finite and nonnegative");
    if(parsed.getUTCFullYear()===year) total=total.plus(amount);
  }
  const matchedPriorCredits=new Set<string>();
  for(const credit of input.adjustments?.priorYearAppliedCredits ?? []) {
    if(credit.type!=="state") continue;
    const amount=d(credit.amount);
    if(!amount.isFinite() || amount.lt(0)) throw new Error("State applied credit must be finite and nonnegative");
    const state=credit.state?.trim().toUpperCase();
    const original=state==="PA" ? pennsylvaniaOriginals?.priorCredit : state==="OH" ? ohioOriginals?.priorCredit : undefined;
    if(state && original!==undefined) {
      const stateName=state==="PA" ? "Pennsylvania" : "Ohio";
      if(matchedPriorCredits.has(state) || credit.sourceTaxYear!==year-1 || !amount.eq(original)) {
        const reason=state==="OH" ? " Each original can match only one distinct claim." : "";
        throw new Error(`Reconcile the saved ${stateName} prior-year credit with the original applied refund.${reason}`);
      }
      matchedPriorCredits.add(state);
      continue;
    }
    if(!state && amount.gt(0) && (pennsylvaniaOriginals?.priorCredit.gt(0) || ohioOriginals?.priorCredit.gt(0))) {
      const stateName=pennsylvaniaOriginals?.priorCredit.gt(0) ? "Pennsylvania" : "Ohio";
      throw new Error(`Identify the jurisdiction of the saved prior-year credit before reconciling the ${stateName} applied refund.`);
    }
    if(credit.sourceTaxYear!==year-1) throw new Error("State applied credit source year must be the immediately prior return year");
    total=total.plus(amount);
  }
  return total;
}
