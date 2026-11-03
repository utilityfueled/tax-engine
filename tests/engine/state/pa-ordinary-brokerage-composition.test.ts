// Spec: state/pa-ordinary-brokerage-sources.yaml. Literal oracles frozen before products.
import Decimal from 'decimal.js';
import {expect,it} from 'vitest';
import {calculatePAResidencySources} from '@/engine/state/pa-residency-sources';
import {calculatePAOrdinaryReturn} from '@/engine/state/pa-ordinary-return';
import {calculatePAOrdinaryReturnFacts} from '@/engine/state/pa-ordinary-return-facts';
import {confirmGuidedPAResidencySources,buildGuidedPAResidencySources} from '@/lib/guided-pa-residency-facts';
import {computeGuidedPreview} from '@/lib/guided-preview-compute';
import {currentInvestmentOriginals,incompleteInvestmentWithholdingState,confirmFictionalInvestmentStateSources,paOrdinaryBrokerageFixture,rebindBrokerageFixture} from '../../fixtures/pa-ordinary-brokerage-sources';
import {paOrdinaryInvestmentFixture} from '../../fixtures/pa-ordinary-investment-sources';
import {paOrdinaryDigitalFixture} from '../../fixtures/pa-ordinary-digital-sources';

it('ordinary brokerage composition allocates all3 actual resident dates and worldwide SP',()=>{
 for(const [status,included,outside,taxable,tax,due,spOutside] of [['resident','1000','0','51120','1569','30','0'],['part_year','400','600','26440','812','13','24680'],['nonresident','0','1000','6000','184','0','45120']] as const){
  const f=paOrdinaryBrokerageFixture(status),before=structuredClone(f),r=calculatePAResidencySources(f.input,f.residency),p=calculatePAOrdinaryReturnFacts(f.input,f.facts),packet=calculatePAOrdinaryReturn(f.input,f.facts,f.sources);
  expect(Reflect.get(r,'brokerageSources')).toMatchObject({rawGainOrLoss:new Decimal(included),excludedNonPAGainOrLoss:new Decimal(outside)});
  expect(r.totalOrdinaryPATaxableIncome.toFixed()).toBe(taxable);expect(packet.pa40.netGainOrLoss.toFixed()).toBe(included);expect(packet.pa40.taxLiability.toFixed()).toBe(tax);expect(packet.pa40.taxDue.toFixed()).toBe(due);expect(p.spOutsidePAIncome.toFixed()).toBe(spOutside);expect(packet.scheduleSP.eligibilityIncome.toFixed()).toBe('51120');expect(packet.scheduleD?.line12.toFixed()).toBe(included);expect(packet.readiness.filingEligible).toBe(false);expect(f).toEqual(before);
 }
});
it('ordinary brokerage source payments retain exact matching cents without NY credit',()=>{
 const state=incompleteInvestmentWithholdingState();confirmFictionalInvestmentStateSources(state,'NY');
 const first=currentInvestmentOriginals(state),actual=state.sectionData['state-return'];if(!actual)throw Error('Fixture confirmed state sources missing');
 const r=calculatePAOrdinaryReturn({...first,paResidencySources:actual.paResidencySources},actual.paOrdinaryReturnFacts,actual.paOrdinaryReturnCompletionSources);
 expect(calculatePAOrdinaryReturnFacts({...first,paResidencySources:actual.paResidencySources},actual.paOrdinaryReturnFacts).paWithholding.toFixed()).toBe('0.3');expect(r.pa40.stateWithholding.toFixed()).toBe('0');expect(r.pa40.residentCredit.toFixed()).toBe('0');expect(r.pa40.taxLiability.toFixed()).toBe('0');expect(computeGuidedPreview(state)?.state?.stateWithholding).toBe('0');
 const investments=state.sectionData['income-investments'];if(!investments)throw Error('Fixture actual investments missing');investments.brokerageEntries[0].state='PA';
 expect(computeGuidedPreview(state)?.state).toBeNull();
 confirmFictionalInvestmentStateSources(state,'PA');expect(computeGuidedPreview(state)?.state?.stateWithholding).toBe('400');
 const second=currentInvestmentOriginals(state),updated=state.sectionData['state-return'];if(!updated)throw Error('Fixture updated state sources missing');
 const rr=calculatePAOrdinaryReturn({...second,paResidencySources:updated.paResidencySources},updated.paOrdinaryReturnFacts,updated.paOrdinaryReturnCompletionSources);expect(calculatePAOrdinaryReturnFacts({...second,paResidencySources:updated.paResidencySources},updated.paOrdinaryReturnFacts).paWithholding.toFixed()).toBe('400.3');expect(rr.pa40.stateWithholding.toFixed()).toBe('400');expect(rr.pa40.netOverpayment.toFixed()).toBe('400');expect(rr.pa40.residentCredit.toFixed()).toBe('0');
});
it('ordinary brokerage zero Box12 permits only inapplicable absent PA allocation',()=>{
 const f=paOrdinaryInvestmentFixture();delete f.input.form1099Div[0].paExemptInterestDividendAllocation;f.residency.dividends[0].original=structuredClone(f.input.form1099Div[0]);
 const before=structuredClone(f.input.form1099Div[0]);expect(calculatePAResidencySources(f.input,f.residency).reportedDividends.toFixed()).toBe('2500');expect(f.input.form1099Div[0]).toEqual(before);expect(Object.hasOwn(f.input.form1099Div[0],'paExemptInterestDividendAllocation')).toBe(false);
 f.residency.dividends[0].noOtherPADividendAdjustmentsConfirmed=null;expect(()=>calculatePAResidencySources(f.input,f.residency)).toThrow(/confirm|source|adjustment|actual/i);
});
it.each(['0.01','1'])('ordinary brokerage zero Box12 rejects contradictory PA allocation %s',value=>{const f=paOrdinaryInvestmentFixture();f.input.form1099Div[0].paExemptInterestDividendAllocation=value;f.residency.dividends[0].original=structuredClone(f.input.form1099Div[0]);expect(()=>calculatePAResidencySources(f.input,f.residency)).toThrow(/actual|source|adjustment|successor/i);});
it('ordinary brokerage absent or positive Box12 never acquires an invented allocation',()=>{for(const value of [undefined,'0.01']){const f=paOrdinaryInvestmentFixture();if(value===undefined)delete f.input.form1099Div[0].exemptInterestDividends;else f.input.form1099Div[0].exemptInterestDividends=value;delete f.input.form1099Div[0].paExemptInterestDividendAllocation;f.residency.dividends[0].original=structuredClone(f.input.form1099Div[0]);expect(()=>calculatePAResidencySources(f.input,f.residency)).toThrow(/actual|amount|source|successor/i);}});
it('ordinary brokerage complete guide confirms originals only on explicit source action',()=>{
 const f=paOrdinaryBrokerageFixture(),draft=structuredClone(f.residency);Reflect.deleteProperty(draft.brokerageSources.statements[0],'original');for(const row of draft.brokerageSources.withholdingOriginals)Reflect.deleteProperty(row,'original');
 expect(()=>buildGuidedPAResidencySources(f.input,draft)).toThrow(/original|source|actual/i);const confirmed=confirmGuidedPAResidencySources(f.input,draft);expect(Reflect.get(confirmed,'brokerageSources')).toMatchObject({statements:[{original:f.input.form1099B[0]}]});expect(draft.brokerageSources.statements[0].original).toBeUndefined();
 const before=structuredClone(confirmed);f.input.form1099B[0].broker='Same money different current broker';expect(()=>buildGuidedPAResidencySources(f.input,confirmed)).toThrow(/original|source|actual/i);expect(confirmed).toEqual(before);
});
it('ordinary brokerage original incomplete source preserves federal preview only',()=>{const state=incompleteInvestmentWithholdingState(),before=structuredClone(state),preview=computeGuidedPreview(state);expect(preview).not.toBeNull();expect(preview?.state).toBeNull();expect(state).toEqual(before);});
it('ordinary brokerage combines digital and securities cents before one class rounding',()=>{
 const f=paOrdinaryBrokerageFixture(),da=paOrdinaryDigitalFixture();f.input.form1099DA=structuredClone(da.input.form1099DA);Object.assign(f.input.form1099DA[0].transactions[0],{proceeds:'100.49',costBasis:'100',paCostBasis:'100'});const digital=structuredClone(da.digital);digital.statements[0].original=structuredClone(f.input.form1099DA[0]);Object.assign(f.residency,{digitalSources:digital});
 f.input.form1099B[0].transactions=f.input.form1099B[0].transactions.slice(0,1);Object.assign(f.input.form1099B[0].transactions[0],{proceeds:'100.49',costBasis:'100'});f.brokerage.statements[0].original=structuredClone(f.input.form1099B[0]);f.brokerage.statements[0].transactions=f.brokerage.statements[0].transactions.slice(0,1);Object.assign(f.brokerage.statements[0].transactions[0],{originalTransaction:structuredClone(f.input.form1099B[0].transactions[0]),grossProceeds:'100.49',paAdjustedBasis:'100'});const withholdingOriginal=f.brokerage.withholdingOriginals.find(row=>row.form==='1099-B');if(!withholdingOriginal)throw Error('Fixture brokerage remittance original missing');withholdingOriginal.original=structuredClone(f.input.form1099B[0]);
 f.facts.timing.remainingTaxPayment={status:'no_remaining_tax',sourceReference:'Fictional independently complete1539withholding covers1539tax'};rebindBrokerageFixture(f);
 const r=calculatePAOrdinaryReturn(f.input,f.facts,f.sources);expect(r.scheduleD?.line12.toFixed()).toBe('1');expect(r.pa40.netGainOrLoss.toFixed()).toBe('1');expect(r.pa40.totalPATaxableIncome.toFixed()).toBe('50121');expect(r.pa40.taxLiability.toFixed()).toBe('1539');expect(r.readiness.filingEligible).toBe(false);
});

it('ordinary brokerage actual payment history cannot omit current settled-account proof',()=>{for(const kind of ['missing','changed'] as const){const state=incompleteInvestmentWithholdingState();confirmFictionalInvestmentStateSources(state,'NY');const actual=state.sectionData['state-return'];if(!actual?.paResidencySources?.brokerageSources)throw Error('Fixture actual current brokerage sources missing');if(kind==='missing')actual.paResidencySources.brokerageSources.settledNYAccounts=[];else actual.paResidencySources.brokerageSources.settledNYAccounts[0].refunds[0].amount='399';const input={...currentInvestmentOriginals(state),paResidencySources:actual.paResidencySources};expect(()=>calculatePAOrdinaryReturn(input,actual.paOrdinaryReturnFacts,actual.paOrdinaryReturnCompletionSources)).toThrow(/actual|source|refund|payment|account/i);}});
