// Spec: spec/federal/guided-foreign-tax-election.yaml.
import { describe, expect, it } from 'vitest';
import { buildGuidedForeignTaxElection, guidedForeignTaxFactErrors, snapshotForeignTaxSource, type ForeignTaxElectionData } from '@/lib/guided-foreign-tax-election';
import { buildTaxInputFromGuidedData } from '@/lib/guided-interview-bridge';
import { emptyOtherTaxesData, updateSectionData, validateSection } from '@/lib/guided-interview-flow';
import { completeInterestEntry, completeW2Entry, startCompleteInterview } from './complete-facts';

export const foreignInterest = { ...completeInterestEntry, payer:'Synthetic foreign bank', payerTin:'112233445', accountReference:'Actual account A', accountHolder:'primary' as const, foreignTaxPaid:'600.75', foreignCountry:'Canada' };
const investment = () => ({interestEntries:[foreignInterest],dividendEntries:[],brokerageEntries:[]});
export const foreignFacts = ():ForeignTaxElectionData => ({taxYear:'2025',election:'deduction',accountingMethod:'paid',priorAccruedCreditElection:false,
  sourceReference:'Actual annual election worksheet',sourceFactsConfirmed:true,allQualifiedForeignTaxesIncludedConfirmed:true,noUnusedCreditCarryoversConfirmed:true,noRedeterminationsConfirmed:true,
  sources:[{...snapshotForeignTaxSource(foreignInterest,'form1099Int:0'),jurisdictionType:'foreign_country',qualifiedIncomeTaxConfirmed:true,taxOnExcludedIncome:'0.25',taxDeductedElsewhere:'0',
    payments:[{date:'2025-03-15',amountUsd:'600.75'}],investmentAllocableAmount:'400.50',allocationMethodDescription:'Actual source allocation',sourceReference:'Actual tax detail'}]});
function stateWithForeignTaxes() {
  const state=startCompleteInterview({filingStatus:'single',incomeTypes:['w2-wages','investments'],lifeEvents:[],stateCode:null});
  state.sectionData['income-w2']={entries:[{...completeW2Entry,wages:'250000',federalWithheld:'100000'}]};
  state.sectionData['income-investments']=investment();state.sectionData['other-taxes']={...emptyOtherTaxesData,foreignTaxElection:foreignFacts()};return state;
}
describe('guided foreign-tax election',()=>{
  it('preserves actual annual election source facts and rejects stale statements',()=>{
    expect(buildGuidedForeignTaxElection(undefined,investment(),2025,'single')).toBeUndefined();
    expect(guidedForeignTaxFactErrors({},investment(),2025,'single')).toHaveProperty('foreignTaxElection');
    const result=buildGuidedForeignTaxElection(foreignFacts(),investment(),2025,'single');
    expect(result?.sources?.[0]).toMatchObject({accountReference:'Actual account A',reportedTaxAmount:'600.75',investmentAllocableAmount:'400.5'});
    for(const changes of [{accountReference:'Replacement account'},{payerTin:'998887777'},{foreignTaxPaid:'601.75'},{foreignCountry:'France'},{accountHolder:'spouse' as const}]) {
      expect(()=>buildGuidedForeignTaxElection(foreignFacts(),{...investment(),interestEntries:[{...foreignInterest,...changes}]},2025,'single')).toThrow();
    }
    expect(()=>buildGuidedForeignTaxElection(foreignFacts(),investment(),2026,'single')).toThrow(/year/i);
  });
  it('preserves omitted account identity on the unverified credit path',()=>{
    const actual = {...investment(),interestEntries:[{...foreignInterest,accountReference:''}]};
    const credit:ForeignTaxElectionData={taxYear:'2025',election:'credit',sourceReference:'Actual annual choice',sourceFactsConfirmed:true};
    expect(buildGuidedForeignTaxElection(credit,actual,2025,'single')?.election).toBe('credit');
    expect(()=>buildGuidedForeignTaxElection(foreignFacts(),actual,2025,'single')).toThrow(/account reference/i);
  });
  it('requires the same complete facts for section completion and return input',()=>{
    const state=stateWithForeignTaxes();
    expect(validateSection(state,'other-taxes').status).toBe('complete');
    const input=buildTaxInputFromGuidedData(state);
    expect(input?.form1099Int[0].accountReference).toBe('Actual account A');
    expect(input?.foreignTaxElection?.sources?.[0].investmentAllocableAmount).toBe('400.5');
    const facts=state.sectionData['other-taxes']?.foreignTaxElection;if(!facts)throw new Error('Missing actual fixture');
    facts.sourceFactsConfirmed=null;
    expect(validateSection(state,'other-taxes').status).not.toBe('complete');expect(buildTaxInputFromGuidedData(state)).toBeNull();
  });
  it('invalidates dependent confirmations after source edits without loops',()=>{
    const state=stateWithForeignTaxes();
    state.sectionData['other-taxes']={...emptyOtherTaxesData,...state.sectionData['other-taxes'],niitSources:{sourceTaxYear:'2025',sourceReference:'Actual NIIT worksheet',sourceFactsConfirmed:true}};
    const changed=updateSectionData(state,'income-investments',{...investment(),interestEntries:[{...foreignInterest,accountReference:'Replacement account'}]});
    expect(changed.sectionData['other-taxes']?.foreignTaxElection?.sourceFactsConfirmed).toBeNull();
    expect(changed.sectionData['other-taxes']?.niitSources?.sourceFactsConfirmed).toBeNull();
    const sourceChanged=updateSectionData(state,'other-taxes',{...state.sectionData['other-taxes'],foreignTaxElection:{...foreignFacts(),election:'credit',sources:undefined}});
    expect(sourceChanged.sectionData['other-taxes']?.foreignTaxElection?.election).toBe('credit');
    expect(sourceChanged.sectionData['other-taxes']?.niitSources?.sourceFactsConfirmed).toBeNull();
    const confirmed=updateSectionData(state,'other-taxes',{...state.sectionData['other-taxes'],foreignTaxElection:{...foreignFacts(),sourceFactsConfirmed:false}});
    expect(confirmed.sectionData['other-taxes']?.niitSources?.sourceFactsConfirmed).toBe(true);
  });
});
