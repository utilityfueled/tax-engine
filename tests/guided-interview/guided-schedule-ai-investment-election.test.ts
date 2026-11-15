// Spec: spec/federal/guided-schedule-ai-investment-election.yaml.
import { expect,it } from 'vitest';
import { guidedInvestmentElectionFixture } from '../fixtures/guided-schedule-ai-investment-election';
import { buildEstimatedTaxFacts } from '@/lib/guided-estimated-tax-facts';
import { buildTaxInputFromGuidedData } from '@/lib/guided-interview-bridge';
import { TaxYearInputSchema } from '@/models/inputs';
import { calculateFederalTax } from '@/engine/federal';
import { updateSectionData } from '@/lib/guided-interview-flow';
import { sanitizeWorkspaceForHostedStorage } from '@/lib/hosted-privacy';
import { createWorkspaceRecord } from '@/lib/workspace-storage';


function required<T,>(value:T|null|undefined):T { if(value===undefined||value===null)throw Error('Complete actual synthetic fixture required');return value; }
it('forwards actual period originals through the guided bridge and existing canonical calculation',()=>{
 const {state,packet,canonical}=guidedInvestmentElectionFixture();
 const facts=buildEstimatedTaxFacts(state.sectionData.payments,2025);
 expect(facts?.investmentElectionSources).toMatchObject({sourceTaxYear:2025,sourceReference:packet.sourceReference,periods:canonical.form2210.investmentElectionSources.periods});
 const built=buildTaxInputFromGuidedData(state);expect(built).not.toBeNull();
 const result=calculateFederalTax(TaxYearInputSchema.parse(built));
 expect(result.totalTaxBeforeCredits.toFixed()).toBe('32537');
 expect(result.form2210?.lines.find(row=>row.form==='Form 2210 Schedule AI'&&row.line==='14b')?.value.toFixed()).toBe('40655');
});
it('rejects unknown originals and preserves qualified method boundaries',()=>{
 const {state}=guidedInvestmentElectionFixture();
 const before=JSON.stringify(state);expect(buildEstimatedTaxFacts(state.sectionData.payments,2025)?.investmentElectionSources).toBeDefined();expect(JSON.stringify(state)).toBe(before);
 for(const mutate of [
  (x:ReturnType<typeof guidedInvestmentElectionFixture>)=>{x.packet.sourceTaxYear='2026';},
  (x:ReturnType<typeof guidedInvestmentElectionFixture>)=>{x.packet.sourceFactsConfirmed=false;},
  (x:ReturnType<typeof guidedInvestmentElectionFixture>)=>{required(x.packet.periods[1]).form4952.investmentInterestExpense='';},
  (x:ReturnType<typeof guidedInvestmentElectionFixture>)=>{required(x.packet.periods[1]).form4952.electedNetCapitalGain='';},
  (x:ReturnType<typeof guidedInvestmentElectionFixture>)=>{required(x.packet.periods[1]).otherItemizedDeductions='';},
  (x:ReturnType<typeof guidedInvestmentElectionFixture>)=>{required(x.packet.periods[1]).periodEnd='2025-06-30';},
  (x:ReturnType<typeof guidedInvestmentElectionFixture>)=>{required(x.packet.periods[1]).form4952.sourceReference=required(x.packet.periods[0]).form4952.sourceReference;},
  (x:ReturnType<typeof guidedInvestmentElectionFixture>)=>{x.facts.calculationMethod='regular';},
 ]) {const x=guidedInvestmentElectionFixture();mutate(x);expect(()=>buildEstimatedTaxFacts(x.state.sectionData.payments,2025)).toThrow();}
 const partial=guidedInvestmentElectionFixture();required(partial.packet.periods[1]).form4952.investmentInterestExpense='2';
 expect(buildEstimatedTaxFacts(partial.state.sectionData.payments,2025)?.investmentElectionSources?.periods?.[1]?.form4952?.investmentInterestExpense).toBe('2');
 for(const mutate of [
  (x:ReturnType<typeof guidedInvestmentElectionFixture>)=>{x.packet.taxpayerSsnLast4='1111';},
  (x:ReturnType<typeof guidedInvestmentElectionFixture>)=>{x.packet.annualForm4952SourceReference='different-source';},
 ]){const x=guidedInvestmentElectionFixture();mutate(x);expect(()=>calculateFederalTax(TaxYearInputSchema.parse(buildTaxInputFromGuidedData(x.state)))).toThrow();}
});
it('revokes stale confirmation and keeps originals private across saved replay',()=>{
 const {state,packet}=guidedInvestmentElectionFixture();
 const replay=JSON.parse(JSON.stringify(state));expect(buildTaxInputFromGuidedData(replay)?.form2210?.investmentElectionSources?.sourceReference).toBe(packet.sourceReference);
 const changed=updateSectionData(state,'income-investments',{...required(state.sectionData['income-investments']),dividendEntries:required(state.sectionData['income-investments']).dividendEntries.map(row=>({...row,qualifiedDividends:'39999'}))});
 expect(changed.sectionData.payments?.estimatedTaxFacts?.sourceFactsConfirmed).toBeNull();expect(buildTaxInputFromGuidedData(changed)).toBeNull();
 const shell=createWorkspaceRecord('guided-private-election');Object.assign(shell,{confirmedTaxInput:buildTaxInputFromGuidedData(state),guidedState:state});
 const publicJson=JSON.stringify(sanitizeWorkspaceForHostedStorage(shell));for(const value of [packet.sourceReference,packet.annualForm4952SourceReference,'investmentElectionSources','123-45-6789'])expect(publicJson).not.toContain(value);
});

it('requires separately entered annual AMT capital gain originals',()=>{
 const{state}=guidedInvestmentElectionFixture();
 expect(buildTaxInputFromGuidedData(state)?.amtCapitalGains).toMatchObject({sourceTaxYear:2025,qualifiedDividends:'40000',netCapitalGain:'0',section1250Gain:'0',collectiblesGain:'0',sourceFactsConfirmed:true});
 for(const key of ['sourceTaxYear','sourceReference','sourceFactsConfirmed','qualifiedDividends','netCapitalGain','section1250Gain','collectiblesGain']){
  const x=guidedInvestmentElectionFixture();Reflect.deleteProperty(x.packet.annualAmtCapitalGains,key);expect(buildTaxInputFromGuidedData(x.state)).toBeNull();
 }
});

it('requires every explicit period amount and denies unsupported imported facts',()=>{
 const keys=['investmentInterestExpense','priorYearDisallowed','grossInvestmentIncome','qualifiedDividendsIncluded','netGainFromInvestmentProperty','netCapitalGainFromInvestmentProperty','electedPreferentialIncome','electedNetCapitalGain','investmentExpenses'];
 for(let period=0;period<4;period++)for(const key of keys){const x=guidedInvestmentElectionFixture();Reflect.deleteProperty(required(x.packet.periods[period]).form4952,key);expect(()=>buildEstimatedTaxFacts(x.state.sectionData.payments,2025)).toThrow();}
 for(const mutate of [
  (x:ReturnType<typeof guidedInvestmentElectionFixture>)=>{Object.assign(required(x.packet.periods[0]).form4952,{childIncomeSources:{}});},
  (x:ReturnType<typeof guidedInvestmentElectionFixture>)=>{required(x.packet.periods[1]).form4952.investmentInterestExpense='-1';},
  (x:ReturnType<typeof guidedInvestmentElectionFixture>)=>{required(x.packet.periods[1]).form4952.investmentInterestExpense='1.01';},
  (x:ReturnType<typeof guidedInvestmentElectionFixture>)=>{required(x.packet.periods[1]).form4952.priorYearDisallowed='1';},
  (x:ReturnType<typeof guidedInvestmentElectionFixture>)=>{x.packet.otherInvestmentIncomePresent=true;},
  (x:ReturnType<typeof guidedInvestmentElectionFixture>)=>{x.packet.annualAmtCapitalGains.sourceTaxYear='2024';},
  (x:ReturnType<typeof guidedInvestmentElectionFixture>)=>{x.packet.annualAmtCapitalGains.sourceFactsConfirmed=false;},
  (x:ReturnType<typeof guidedInvestmentElectionFixture>)=>{x.packet.annualAmtCapitalGains.collectiblesGain='1';},
 ]){const x=guidedInvestmentElectionFixture();mutate(x);expect(()=>buildEstimatedTaxFacts(x.state.sectionData.payments,2025)).toThrow();}
 const noPacket=guidedInvestmentElectionFixture();Reflect.deleteProperty(noPacket.facts,'investmentElectionSources');expect(buildEstimatedTaxFacts(noPacket.state.sectionData.payments,2025)?.investmentElectionSources).toBeUndefined();
});
