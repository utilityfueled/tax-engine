// Spec: spec/federal/form-8814-income-character.yaml.
import { expect, it, vi } from 'vitest';
vi.mock('@/models/constants.js',async originalImport=>{
  const original=await originalImport<typeof import('@/models/constants.js')>();
  const { FEDERAL_2026_CONSTANTS }=await import('@/models/federal-2026-indexed.js');
  return {...original,getConstants:(year:number)=>year===2026?FEDERAL_2026_CONSTANTS:original.getConstants(year)};
});
import { calculateFederalTax } from '@/engine/federal.js';
import { TaxYearInputSchema } from '@/models/inputs.js';
import { simpleW2Fixture } from '../fixtures/simple-w2.js';
import { syntheticChildElection } from '../fixtures/form-8814-election.js';
const source=(year:number)=>({ taxableInterest:'4000',taxExemptInterest:'0',ordinaryDividends:'2000',qualifiedDividends:'0',capitalGainDistributions:'0',
  electionFacts:{...syntheticChildElection(year),incomeCharacter:{sourceReference:'Actual child statements',alaskaPermanentFundDividends:'2000',collectiblesGain:'0',unrecapturedSection1250Gain:'0',section1202Gain:'0'}} });
it('includes child ordinary investment income in NIIT while excluding Alaska',()=>{
  for(const year of [2025,2026]){
    const input=TaxYearInputSchema.parse({...simpleW2Fixture,taxpayer:{...simpleW2Fixture.taxpayer,taxYear:year},w2s:[{...simpleW2Fixture.w2s[0],wages:'300000',federalWithheld:'100000'}],form8814:[source(year)]});
    const before=JSON.stringify(input), result=calculateFederalTax(input);
    expect(result.agi.toFixed()).toBe('303300');
    expect(result.allLines.find(line=>line.form==='Form 8960'&&line.line==='7')?.value.toFixed()).toBe('2200');
    expect(result.allLines.find(line=>line.form==='Form 8960'&&line.line==='17')?.value.toFixed()).toBe('84');
    expect(JSON.stringify(input)).toBe(before);
  }
});
it('aggregates each actual child investment amount once without exposing identities',()=>{
  const first=source(2025), second=source(2025);
  second.electionFacts={...syntheticChildElection(2025,'02'),incomeCharacter:{...second.electionFacts.incomeCharacter,alaskaPermanentFundDividends:'0'}};
  const result=calculateFederalTax(TaxYearInputSchema.parse({...simpleW2Fixture,w2s:[{...simpleW2Fixture.w2s[0],wages:'300000',federalWithheld:'100000'}],form8814:[first,second]}));
  expect(result.agi.toFixed()).toBe('306600');
  expect(result.allLines.find(line=>line.form==='Form 8960'&&line.line==='7')?.value.toFixed()).toBe('5500');
  expect(result.allLines.find(line=>line.form==='Form 8960'&&line.line==='17')?.value.toFixed()).toBe('209');
  const characterAudit=JSON.stringify(result.allLines.filter(line=>line.form==='Form8814 income character'));
  expect(characterAudit).not.toContain(first.electionFacts.child.ssn);
  expect(characterAudit).not.toContain(second.electionFacts.child.ssn);
});
it('nets child distributions with parent capital losses before the annual loss limit',()=>{
  const child=source(2025);child.taxableInterest='0';child.ordinaryDividends='0';child.capitalGainDistributions='6000';child.electionFacts.incomeCharacter.alaskaPermanentFundDividends='0';
  const input=TaxYearInputSchema.parse({...simpleW2Fixture,form8814:[child],priorYear:{shortTermCapitalLoss:'-10000'}});
  const result=calculateFederalTax(input);
  expect(result.allLines.find(line=>line.form==='1040'&&line.line==='7')?.value.toFixed()).toBe('-3000');
  expect(result.scheduleD.netLongTerm.toFixed()).toBe('3300');
  expect(result.scheduleD.netCapitalGainLoss.toFixed()).toBe('-6700');
  expect(result.carryforwards.shortTermCapitalLoss.toFixed()).toBe('-3700');
});
it('requires the special gain netting method before returning child special-rate income',()=>{
  for (const field of ['collectiblesGain','unrecapturedSection1250Gain'] as const) {
    const child=source(2025);child.taxableInterest='0';child.ordinaryDividends='0';child.capitalGainDistributions='6000';child.electionFacts.incomeCharacter.alaskaPermanentFundDividends='0';child.electionFacts.incomeCharacter[field]='1000';
    const input=TaxYearInputSchema.parse({...simpleW2Fixture,form8814:[child],priorYear:{shortTermCapitalLoss:'-1000'}});
    expect(()=>calculateFederalTax(input)).toThrow(/ScheduleD.*18.*19.*source|special.*gain.*netting/i);
  }
});
