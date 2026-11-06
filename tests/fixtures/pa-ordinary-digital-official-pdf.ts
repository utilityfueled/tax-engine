/** Explicit fictional paper sources; no production defaults or inferred facts. */
import {calculateFederalTax} from '@/engine/federal.js';
import {calculatePAOrdinaryReturn} from '@/engine/state/pa-ordinary-return.js';
import {PAOrdinaryReturnFactsSchema} from '@/models/pa-ordinary-return-facts.js';
import {PAOrdinaryReturnCompletionSourcesSchema} from '@/models/pa-ordinary-return-completion.js';
import type {TaxYearInput} from '@/models/inputs.js';
import {paOrdinaryDigitalFixture,refreshDigitalFixtureOriginals} from './pa-ordinary-digital-sources.js';
export type DigitalPaperKind='normal'|'loss'|'zero'|'private'|'many'|'none'|'mismatch-low'|'mismatch-high'|'mismatch-sum'|'wide-money';
export function paOrdinaryDigitalPaperFixture(kind:DigitalPaperKind='normal'){
 const f=paOrdinaryDigitalFixture(),transaction=f.input.form1099DA[0].transactions[0];
 if(kind==='loss')transaction.paCostBasis='200.49';if(kind==='zero')transaction.paCostBasis='100.49';
 if(kind==='mismatch-low')transaction.paCostBasis='80.50';if(kind==='mismatch-high'){transaction.proceeds='100.50';transaction.paCostBasis='80.49';}
 if(kind==='private')transaction.digitalAssetName='Complete fictional asset description '+f.input.taxpayer.primary.ssn+' '+f.input.taxpayer.primary.ssn.replace(/\D/g,'')+' '+f.input.form1099DA[0].brokerTin+' '+f.input.form1099DA[0].accountReference+' '+transaction.sourceId+' END OF COMPLETE ASSET SOURCE';
 if(kind==='many')f.input.form1099DA[0].transactions=Array.from({length:13},(_,index)=>({...structuredClone(transaction),sourceId:'Fictional actual distinct sale '+index,digitalAssetName:'Actual asset '+(index+1),proceeds:'100',paCostBasis:'80'}));
 if(kind==='mismatch-sum')f.input.form1099DA[0].transactions=Array.from({length:2},(_,index)=>({...structuredClone(transaction),sourceId:'Fictional actual distinct residual '+index,proceeds:'100.49',paCostBasis:'100'}));
 if(kind==='wide-money'){transaction.proceeds='999999999999999999.49';transaction.paCostBasis='999999999999999979.24';transaction.costBasis='999999999999999979.24';}
 if(kind==='none')f.input.form1099DA=[];
 refreshDigitalFixtureOriginals(f);
 if(kind==='none')delete (f.residency as {digitalSources?:unknown}).digitalSources;
 f.facts.timing.remainingTaxPayment.amountAppliedToTax=kind==='many'?'1543':kind==='loss'||kind==='zero'||kind==='none'||kind==='mismatch-sum'?'1535':'1536';
 const input:TaxYearInput=Object.assign(f.input,{paOrdinaryReturnFacts:PAOrdinaryReturnFactsSchema.parse(f.facts),paOrdinaryReturnCompletionSources:PAOrdinaryReturnCompletionSourcesSchema.parse(f.sources)});
 const ordinary=calculatePAOrdinaryReturn(input,input.paOrdinaryReturnFacts,input.paOrdinaryReturnCompletionSources),result=calculateFederalTax(input);result.stateReturns={pennsylvania:ordinary};return {...f,input,ordinary,result};
}
