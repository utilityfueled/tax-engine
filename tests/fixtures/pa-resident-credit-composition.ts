/** New explicit fictional composition sources and literal oracles, never application defaults. */
import {snapshotPAOrdinaryReturnOriginals} from '@/engine/state/pa-ordinary-return-facts';
import {paResidentCreditFixture,rebindPAResidentCreditFixture} from './pa-resident-credit-sources';
export function paCreditCompositionFixture(status:'resident'|'part_year'='resident',compensation='50000'){
 const f=paResidentCreditFixture(status,compensation),credit=status==='part_year'?'614':'1535';
 f.facts.disposition={kind:'allocation',sourceReference:'Explicit new complete PA resident credit refund election',refundRequested:credit,nextYearCreditRequested:'0',donations:[]};
 rebindPAResidentCreditFixture(f);const t=f.input.taxpayer.primary;
 const sources={...f.sources,originalFederalSources:snapshotPAOrdinaryReturnOriginals(f.input),otherStateTaxes:{...f.sources.otherStateTaxes,status:'actual_payments',residentCreditSources:f.packet,jurisdictions:[{state:'NY',sourceReference:'Explicit reviewed zero NY account history',sourceTaxYear:2025,accountName:t.firstName+' '+t.lastName,accountSsn:t.ssn,completeThroughDate:f.facts.timing.asOfDate,taxPaid:'0',incomeTaxWithheld:'0'},{state:'DE',sourceReference:'Explicit current DE final filed return and tax account history',sourceTaxYear:2025,accountName:t.firstName+' '+t.lastName,accountSsn:t.ssn,completeThroughDate:f.facts.timing.asOfDate,taxPaid:'2000',incomeTaxWithheld:'0'}]}};
 return {...f,sources};
}
export function paCreditCompositionSPFixture(){
 const f=paCreditCompositionFixture('resident','6000'),c=f.packet.claims[0];if(!c)throw Error('Actual fictional DE return is missing');
 c.filedReturn.taxBeforeNonpaymentCredits='100';c.filedReturn.taxAfterNonpaymentCredits='100';c.payments[0].amountAppliedToTax='100';c.account.netTaxPaymentsReported='100';
 f.sources.otherStateTaxes.jurisdictions[1].taxPaid='100';f.facts.disposition.refundRequested='1539';rebindPAResidentCreditFixture(f);return f;
}
export function paCreditCompositionWithholdingFixture(){
 const f=paCreditCompositionFixture(),w=f.input.w2s[0],c=f.packet.claims[0];if(!w?.stateLocalSources||!c)throw Error('Complete fictional original is missing');
 const row=w.stateLocalSources.stateRows[0];if(!row)throw Error('Actual printed PA row missing');
 w.stateLocalSources.stateReporting='multiple';w.stateLocalSources.stateRows.push({...row,printedRow:2,state:'DE',sourceReference:'Explicit actual printed DE Box17 original800',withheld:'800'});
 c.wages[0].originalW2=structuredClone(w);c.payments[0].amountAppliedToTax='1200';c.payments.push({...c.payments[0],kind:'withholding',date:'2025-12-31',sourceReference:'Explicit actual DE W2 withholding credit',confirmationNumber:'Explicit-DE-Box17-800',amountAppliedToTax:'800',w2Index:0,originalW2:structuredClone(w)});
 f.sources.otherStateTaxes.jurisdictions[1].incomeTaxWithheld='800';rebindPAResidentCreditFixture(f);f.sources.originalFederalSources=snapshotPAOrdinaryReturnOriginals(f.input);return f;
}
