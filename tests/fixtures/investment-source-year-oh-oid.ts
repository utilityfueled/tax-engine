/** Explicit new synthetic source identity; no product factual defaults. */
import {Form1099OIDSchema} from '@/models/inputs.js';
import type {InvestmentData} from '@/lib/guided-investment-facts';
import {completeInterestSource,completeDividendSource,completeBrokerageSource} from '../guided-interview/complete-facts';
import {ohioPaymentFixture} from './oh-payments';
export function actualInvestmentYearData(year:string|undefined):InvestmentData{
 const data:InvestmentData={interestEntries:[structuredClone(completeInterestSource)],dividendEntries:[structuredClone(completeDividendSource)],brokerageEntries:[structuredClone(completeBrokerageSource)]};
 for(const row of [...data.interestEntries,...data.dividendEntries,...data.brokerageEntries]){
  if(year===undefined)Reflect.deleteProperty(row,'sourceTaxYear');else Reflect.set(row,'sourceTaxYear',year);
 }
 // Explicit fictional2026 sale belongs to that original calendar year.
 if(year==='2026'){
  for(const broker of data.brokerageEntries)for(const row of broker.transactions)row.dateSold='2026-02-03';
  data.qofDispositionFacts={sourceTaxYear:'2026',sourceReference:'Explicit fictional complete2026 review, no QOF investment/deferred gain',sourceFactsConfirmed:true,allInvestmentsReviewed:true,disposedOfQofInvestment:false,deferredGainHeldAtYearEnd:false};
 }
 return data;
}
export type ActualOidStateRow={state:string;statePayerId:string;stateWithheld:string};
export const actualOidStateRows:ActualOidStateRow[]=[{state:'PA',statePayerId:'PRIVATE-ACTUAL-PA-ID',stateWithheld:'99.99'},{state:'OH',statePayerId:'PRIVATE-ACTUAL-OH-ID',stateWithheld:'10.11'}];
export function actualOidStateSource(rows:ActualOidStateRow[]=actualOidStateRows){return Form1099OIDSchema.parse({
 payer:'Synthetic actual OID broker',sourceId:'PRIVATE-ACTUAL-OID-ORIGINAL',accountHolder:'primary',taxYear:2025,sourceFormRevision:'2024-01',sourceFactsConfirmed:true,recipientAmountsConfirmed:true,
 obligationType:'taxable',inflationIndexed:false,description:'Synthetic original taxable obligation',originalIssueDiscount:'100.10',otherPeriodicInterest:'20.20',earlyWithdrawalPenalty:'0',federalWithheld:'0',marketDiscount:'0',acquisitionPremium:'0',treasuryOID:'0',investmentExpenses:'0',bondPremium:'0',taxExemptOID:'0',oidReportedNetOfAcquisitionPremium:false,interestReportedNetOfBondPremium:false,stateWithholding:structuredClone(rows),
});}
export function rebindOidPaymentOriginals(input:ReturnType<typeof ohioPaymentFixture>){const{ohioResidency:_r,ohioPayments:_p,...original}=input;input.ohioResidency.originalFederalSources=structuredClone(original);input.ohioPayments.originalFederalSources=structuredClone(original);}
export function ohioOidStateSourceFixture(rows:ActualOidStateRow[]=actualOidStateRows){const input=ohioPaymentFixture();input.form1099OID=[actualOidStateSource(rows)];rebindOidPaymentOriginals(input);return input;}
