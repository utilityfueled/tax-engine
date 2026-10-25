// Spec: spec/federal/form-8814-income-character.yaml.
import { expect, it } from 'vitest';
import { Form8814ChildSchema } from '@/models/inputs.js';
import { getConstants } from '@/models/constants.js';
import { calculateForm8814IncomeCharacter } from '@/engine/forms/form-8814-income-character.js';
import { syntheticChildElection } from '../../fixtures/form-8814-election.js';

export const character = () => ({ sourceReference: 'Actual child income statements', alaskaPermanentFundDividends: '2000', collectiblesGain: '0', unrecapturedSection1250Gain: '0', section1202Gain: '0' });
function child(changes = {}) {
  return Form8814ChildSchema.parse({ taxableInterest: '4000', taxExemptInterest: '0', ordinaryDividends: '2000', qualifiedDividends: '0', capitalGainDistributions: '0',
    electionFacts: { ...syntheticChildElection(), incomeCharacter: character() }, ...changes });
}
it('requires actual character and rejects contradictory source subsets', () => {
  const unknown=child(); delete unknown.electionFacts!.incomeCharacter;
  expect(()=>calculateForm8814IncomeCharacter([unknown],getConstants(2025))).toThrow(/actual.*character|character.*source/i);
  for (const patch of [{ alaskaPermanentFundDividends:undefined },{ alaskaPermanentFundDividends:'2000.01' },{ alaskaPermanentFundDividends:'-1' },{ alaskaPermanentFundDividends:'NaN' },{ collectiblesGain:'1' },{ section1202Gain:'1' },{ sourceReference:'' }]) {
    expect(()=>{
      const input=child({electionFacts:{...syntheticChildElection(),incomeCharacter:{...character(),...patch}}});
      return calculateForm8814IncomeCharacter([input],getConstants(2025));
    }).toThrow();
  }
  const qualified=child({qualifiedDividends:'1'});
  expect(()=>calculateForm8814IncomeCharacter([qualified],getConstants(2025))).toThrow(/Alaska|subset/i);
  const qsbs=child({capitalGainDistributions:'1000',electionFacts:{...syntheticChildElection(),incomeCharacter:{...character(),section1202Gain:'1000'}}});
  expect(()=>calculateForm8814IncomeCharacter([qsbs],getConstants(2025))).toThrow(/acquisition.*issuer/i);
  for(const override of [{taxYear:2024},{sourceFactsConfirmed:false}]) {
    const input=child({electionFacts:{...syntheticChildElection(),incomeCharacter:character(),...override}});
    expect(()=>calculateForm8814IncomeCharacter([input],getConstants(2025))).toThrow(/confirmed.*character.*election year/i);
  }
  expect(()=>calculateForm8814IncomeCharacter([child({taxableInterest:'12000'})],getConstants(2025))).toThrow(/election range/i);
});
it('reproduces the IRS Alaska example without adding child income twice',()=>{
  const input=child(), before=JSON.stringify(input);
  const result=calculateForm8814IncomeCharacter([input],getConstants(2025));
  expect(result.children[0]?.alaskaIncomeToReport.toFixed()).toBe('1100');
  expect(result.ordinaryInvestmentIncome.toFixed()).toBe('2200');
  expect(result.grossInvestmentIncomeFor4952.toFixed()).toBe('2200');
  expect(result.children[0]?.line12.toFixed()).toBe('3300');
  expect(JSON.stringify(input)).toBe(before);
  const below=child({taxableInterest:'0'});
  expect(calculateForm8814IncomeCharacter([below],getConstants(2025)).ordinaryInvestmentIncome.isZero()).toBe(true);
  const cents=child({taxableInterest:'4000.50',ordinaryDividends:'1999.50',electionFacts:{...syntheticChildElection(),incomeCharacter:{...character(),alaskaPermanentFundDividends:'1999.50'}}});
  expect(calculateForm8814IncomeCharacter([cents],getConstants(2025)).children[0]?.alaskaIncomeToReport.toFixed()).toBe('1100');
  expect(calculateForm8814IncomeCharacter([],getConstants(2025)).ordinaryInvestmentIncome.toFixed()).toBe('0');
});
it('allocates special gains using the child amount reported on parent ScheduleD',()=>{
  const input=child({ ordinaryDividends:'0',capitalGainDistributions:'6000',electionFacts:{...syntheticChildElection(),incomeCharacter:{...character(),alaskaPermanentFundDividends:'0',collectiblesGain:'1000',unrecapturedSection1250Gain:'2000'}} });
  const result=calculateForm8814IncomeCharacter([input],getConstants(2025));
  expect(result.children[0]?.capitalGainDistributionsToReport.toFixed()).toBe('4380');
  expect(result.collectiblesGain.toFixed()).toBe('730');
  expect(result.unrecapturedSection1250Gain.toFixed()).toBe('1460');
  expect(result.ordinaryInvestmentIncome.toFixed()).toBe('2920');
});
