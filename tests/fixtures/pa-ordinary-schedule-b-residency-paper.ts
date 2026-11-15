/** Fictional dated originals and literal paper oracles, independent of renderer values. */
import {TaxYearInputSchema} from '@/models/inputs.js';
import {buildTaxInputFromGuidedData} from '@/lib/guided-interview-bridge';
import {confirmGuidedPAResidencySources} from '@/lib/guided-pa-residency-facts';
import {confirmGuidedPAOrdinaryReturnFacts} from '@/lib/guided-pa-ordinary-return-facts';
import {confirmGuidedPAOrdinaryReturnCompletionSources} from '@/lib/guided-pa-ordinary-return-completion';
import {guidedPAOrdinaryPanelFixture,required} from './guided-pa-ordinary-panels.js';
import {completeDividendSource} from '../guided-interview/complete-facts.js';
import {calculateFederalTax} from '@/engine/federal.js';
import {calculatePAOrdinaryReturn} from '@/engine/state/pa-ordinary-return.js';
import {paOrdinaryInvestmentFixture,fractionalInvestmentFixture,rebindInvestmentFixture} from './pa-ordinary-investment-sources.js';
export const PA_B_RESIDENCY_ORACLES={
 ordinary:['2000','0','0','1200','1200','800','0','0','0','0','0','500','0','1300'],
 signed:['0','0','0','500','500','-500','0','0','0','0','0','500','0','0'],
 cents:['1','0','0','1','1','0','0','0','0','0','0','1','0','1'],
 outsideCents:['0','0','0','1','1','-1','0','0','0','0','0','0','0','0'],
 boundary:['2000','0','0','0','0','2000','0','0','0','0','0','500','0','2500'],
} as const;
export function paOrdinaryScheduleBResidencyPaperFixture(kind:'ordinary'|'signed'|'cents'|'boundary'|'outside-cents'='ordinary',status:'part_year'|'nonresident'='part_year'){
 const f=kind==='cents'?fractionalInvestmentFixture():paOrdinaryInvestmentFixture(status);
 if(kind==='signed'){
  const original=f.input.form1099Div[0];original.ordinaryDividends='0';original.totalCapitalGainDistributions='500';
  f.residency.dividends[0].original=structuredClone(original);
  f.residency.dividends[0].credits=[{sourceReference:'Fictional complete outside-period capital credit',creditedOn:'2025-06-30',ordinaryDividends:'0',capitalGainDistributions:'500'}];
  f.facts.timing.remainingTaxPayment={status:'no_remaining_tax',sourceReference:'Fictional explicit799withholding settles799tax'};
 }
 if(kind==='outside-cents'){
  const original=f.input.form1099Div[0];original.ordinaryDividends='0.49';original.totalCapitalGainDistributions='0.49';
  f.residency.dividends[0].original=structuredClone(original);
  f.residency.dividends[0].credits=[{sourceReference:'Fictional exact outside-period49cent ordinary and capital credit',creditedOn:'2025-06-30',ordinaryDividends:'0.49',capitalGainDistributions:'0.49'}];
  f.facts.timing.remainingTaxPayment={status:'no_remaining_tax',sourceReference:'Fictional explicit799withholding settles799tax'};
 }
 if(kind==='boundary'){
  f.residency.dividends[0].credits[0].creditedOn='2025-07-01';
  f.facts.timing.remainingTaxPayment={status:'expected_payment',date:'2026-04-15',amountAppliedToTax:'77',sourceReference:'Fictional explicit876tax less799withholding'};
 }
 rebindInvestmentFixture(f);Object.assign(f.input,{paOrdinaryReturnFacts:f.facts,paOrdinaryReturnCompletionSources:f.sources});
 const ordinary=calculatePAOrdinaryReturn(f.input,f.facts,f.sources),result=calculateFederalTax(f.input);result.stateReturns={pennsylvania:ordinary};
 return {...f,ordinary,result};
}

/** Explicit fictional complete guided originals, confirmed through the real bridge. */
export function paOrdinaryScheduleBResidencyGuidedFixture(status:'part_year'|'nonresident'){
 const panel=guidedPAOrdinaryPanelFixture(status),f=paOrdinaryInvestmentFixture(status),state=panel.state,original=f.input.form1099Div[0];
 required(state.sectionData['income-investments']).dividendEntries=[{...completeDividendSource,payer:original.payer,payerTin:original.payerTin,accountReference:original.accountReference,ordinaryDividends:'2000',capitalGainDistributions:'500',stateTaxReporting:'single',state:'PA',stateWithheld:'0'}];
 const raw=TaxYearInputSchema.parse(required(buildTaxInputFromGuidedData(state))),draft=structuredClone(f.residency);
 draft.wages.forEach(row=>{row.original=structuredClone(raw.w2s[required(row.originalIndex)]);});draft.interest.forEach(row=>{row.original=structuredClone(raw.form1099Int[required(row.originalIndex)]);});draft.dividends.forEach(row=>{row.original=structuredClone(raw.form1099Div[required(row.originalIndex)]);});
 const residency=confirmGuidedPAResidencySources(raw,draft),input={...raw,paResidencySources:residency};
 const facts=confirmGuidedPAOrdinaryReturnFacts(input,f.facts),sources=confirmGuidedPAOrdinaryReturnCompletionSources(input,f.sources,facts);
 state.sectionData['state-return']={stateEstimatedPayments:[],additionalStateWithholding:'',paResidencySources:residency,paOrdinaryReturnFacts:facts,paOrdinaryReturnCompletionSources:sources};
 return {state,input,facts,sources};
}
