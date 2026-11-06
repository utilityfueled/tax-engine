/** Separate complete fictional cohort. Original guided royalty fixture remains unchanged. */
import {TaxYearInputSchema} from '@/models/inputs.js';
import {snapshotPAOrdinaryReturnOriginals} from '@/engine/state/pa-ordinary-return-facts.js';
import {buildGuidedRoyaltySources} from '@/lib/guided-royalty-sources';
import {actualGuidedPARoyaltySources} from './guided-pa-royalty-sources';
import {startCompleteInterview} from '../guided-interview/complete-facts';
import {paOrdinaryReturnFixture} from './pa-ordinary-return';
export function paOrdinaryRoyaltyFixture(corrected=false){
 const f=paOrdinaryReturnFixture();
 const state=startCompleteInterview({filingStatus:'single',incomeTypes:['w2-wages','royalties'],lifeEvents:[],stateCode:'PA'});
 const data=actualGuidedPARoyaltySources();
 if(corrected){data.properties[0].expenses[0].amountPaid='149.25';data.properties[0].paTreatment.expenses[0].amountPaid='149.25';}
 state.sectionData['income-royalties']=data;
 const royalty=buildGuidedRoyaltySources(state);
 const input=TaxYearInputSchema.parse({...f.input,form1099Int:[],...royalty,
  taxpayer:{...f.input.taxpayer,stateResidency:'full-year',address:{street:'10 Fictional Way',city:'Pittsburgh',state:'PA',zip:'15222'}},
  w2s:[{...f.input.w2s[0],wages:'200000',state:'PA',stateWages:'200000',stateTaxWithheld:'0'}]});
 if(!f.input.paResidencySources)throw new Error('Fictional base residency packet missing');
 const t=input.taxpayer.primary;
 const royaltySources={sourceTaxYear:2025,sourceReference:'Fictional complete actual copyright scope ledger',sourceFactsConfirmed:true,
  owner:{accountHolder:'primary' as const,originalTaxpayer:{firstName:t.firstName,lastName:t.lastName,ssn:t.ssn}},
  originalPropertySources:structuredClone(input.royaltyPropertySources),
  originals:[{originalIndex:0,sourceTaxYear:2025,sourceReference:'Fictional retained complete royalty MISC original',sourceFactsConfirmed:true,
   currentUncorrectedNonvoidOriginalConfirmed:true,allOriginalBoxesKnownConfirmed:true,royaltyOnlyIncomeConfirmed:true,
   original:structuredClone(input.form1099Misc[0])}]};
 const residency={...structuredClone(f.input.paResidencySources),interest:[],royaltySources,
  wages:[{...structuredClone(f.input.paResidencySources.wages[0]),original:structuredClone(input.w2s[0]),
   payroll:[{sourceReference:'Fictional actual PA200000 payroll ledger',paidOn:'2025-12-31',serviceFrom:'2025-01-01',serviceThrough:'2025-12-31',grossCompensation:'200000',paServicesCompensation:'200000',outsidePAServicesCompensation:'0'}]}]};
 input.paResidencySources=residency;
 const owner={accountName:t.firstName+' '+t.lastName,accountSsn:t.ssn};
 const facts={...structuredClone(f.facts),originalFederalSources:snapshotPAOrdinaryReturnOriginals(input),
  payments:{...structuredClone(f.facts.payments),priorReturn:{status:'return',sourceReference:'Fictional actually filed prior full-year zero PA return',filedConfirmed:true,fullYearResidentConfirmed:true,
   original:{...owner,taxYear:2024,returnType:'pa40',residency:'resident',filingStatus:'S',filedOn:'2025-03-01',taxableIncome:'0',taxForgivenessCredit:'0'}}},
  timing:{...structuredClone(f.facts.timing),asOfDate:'2026-03-20',remainingTaxPayment:{status:'expected_payment',date:'2026-04-15',amountAppliedToTax:corrected?'6475':'6478',sourceReference:'Fictional separately supplied exact planned PA principal'}}};
 const completion={...structuredClone(f.sources),originalFederalSources:snapshotPAOrdinaryReturnOriginals(input),otherStateTaxes:{status:'actual_payments',sourceReference:'Fictional complete retained Michigan withholding history',allJurisdictionsAndPaymentsReviewedConfirmed:true,
  jurisdictions:[{...owner,state:'MI',sourceReference:'Fictional complete MI royalty account',sourceTaxYear:2025,completeThroughDate:'2026-03-20',taxPaid:'0',incomeTaxWithheld:'80.20'}]}};
 return {input,residency,royaltySources,facts,completion};
}
