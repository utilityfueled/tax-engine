// Spec: spec/federal/form-8962-marriage-sources.yaml.
import { expect, it } from 'vitest';
import { calculateForm8962MarriageSources } from '@/engine/forms/form-8962-marriage-sources.js';
import { marriageSourcesFixture } from '../../fixtures/marriage-sources.js';

type Fixture = ReturnType<typeof marriageSourcesFixture>;
function known<T>(value:T|undefined):T {
  if(value===undefined) throw new Error('Fictional source fixture is incomplete');
  return value;
}
function sources(input:Fixture) {
  const facts=known(input.form8962), packet=known(facts.marriageSources);
  return {facts,packet,dependents:known(packet.dependents),policies:known(packet.policies),
    benchmarks:known(packet.benchmarks),monthly:known(facts.monthlyReconciliation),
    standard:known(input.standardDeductionFacts)};
}
function rebindPolicies(input:Fixture) {
  sources(input).packet.policies=input.form1095A.map((original,index)=>({sourceId:`form1095A:${index}`,
    sourceReference:'Actual original policy statement',original:structuredClone(original),
    fullMonthCoverageConfirmed:true,allCoveredIndividualsEligibleForPtcConfirmed:true}));
}
it('binds actual spouse and dependent sources without an income or credit override', () => {
  for (const year of [2025,2026]) {
    const input=marriageSourcesFixture(year), before=JSON.stringify(input);
    expect(input.form8962?.taxpayerModifiedAGI).toBeUndefined();
    const result=calculateForm8962MarriageSources(input);
    expect(result.marriageMonth).toBe(7);expect(result.familySize).toBe(4);
    expect(result.families.map(row=>[row.owner,row.familySize,row.months.length])).toEqual([['primary',1,7],['spouse',3,7]]);
    expect(result.families.map(row=>[row.months[0].premium.toFixed(),row.months[0].slcsp.toFixed()])).toEqual([['500','433'],['1000','833']]);
    expect(JSON.stringify(input)).toBe(before);
  }
});
it('rejects stale original policy identities amounts and coverage periods', () => {
  for(const mutate of [
    (input:Fixture)=>{input.form1095A[0].policyNumber='Equal-money replacement';},
    (input:Fixture)=>{input.form1095A[0].monthlyPremiums[0].enrolleePremium='500.01';},
    (input:Fixture)=>{known(input.form1095A[0].coveredIndividuals)[0].firstMonth=2;},
    (input:Fixture)=>{sources(input).policies[1].sourceId='form1095A:0';},
    (input:Fixture)=>{input.form1095A[0].recipientSsn='999-88-7777';},
  ]) { const input=marriageSourcesFixture();mutate(input);expect(()=>calculateForm8962MarriageSources(input)).toThrow(); }
});
it('separates alternative family membership from the actual policy recipient', () => {
  const input=marriageSourcesFixture(),packet=sources(input).packet;
  known(packet.dependents)[0].qualifiesForPrimary=true;known(packet.dependents)[0].alternativeFamilyOwner='primary';
  const result=calculateForm8962MarriageSources(input);
  expect(result.families.map(row=>[row.owner,row.familySize,row.months[0].premium.toFixed()])).toEqual([['primary',2,'500'],['spouse',2,'1000']]);
  known(packet.dependents)[0].qualifiesForPrimary=false;
  expect(()=>calculateForm8962MarriageSources(input)).toThrow(/dependent|qualif/i);
});
it('requires exact complete benchmark groups and known monthly eligibility', () => {
  for(const mutate of [
    (input:Fixture)=>{sources(input).benchmarks.pop();},
    (input:Fixture)=>{sources(input).benchmarks[0].coveredIndividualSsns=['444-55-6666'];},
    (input:Fixture)=>{sources(input).benchmarks[0].sourceFactsConfirmed=undefined;},
    (input:Fixture)=>{sources(input).policies[0].fullMonthCoverageConfirmed=undefined;},
    (input:Fixture)=>{sources(input).monthly[0].enrolleePremium='1499.99';},
    (input:Fixture)=>{sources(input).monthly[0].coverageEligible=false;},
  ]) {const input=marriageSourcesFixture();mutate(input);expect(()=>calculateForm8962MarriageSources(input)).toThrow();}
});
it('preserves unsupported and unknown facts instead of certifying an election', () => {
  for(const mutate of [
    (input:Fixture)=>{sources(input).packet.marriageDate='2025-07-01';},
    (input:Fixture)=>{sources(input).packet.marriageDate='2024-07-15';},
    (input:Fixture)=>{sources(input).packet.primaryUnmarriedOnJanuary1=undefined;},
    (input:Fixture)=>{sources(input).packet.marriedToEachOtherOnDecember31=false;},
    (input:Fixture)=>{sources(input).standard.spouseCanBeClaimedAsDependent=true;},
    (input:Fixture)=>{sources(input).facts.allocationRequired=true;},
    (input:Fixture)=>{sources(input).facts.selfEmployedHealthInsuranceCoordinationRequired=true;},
    (input:Fixture)=>{sources(input).monthly[0].incomeBasedSepEnrollment=true;},
  ]) {const input=marriageSourcesFixture();mutate(input);expect(()=>calculateForm8962MarriageSources(input)).toThrow();}
});

it('preserves exact same-recipient policy cents and one corrected benchmark',()=>{
  const input=marriageSourcesFixture(),extra=structuredClone(input.form1095A[0]);
  extra.policyNumber='Additional actual policy';
  for(const row of input.form1095A[0].monthlyPremiums) row.enrolleePremium='300.01';
  for(const row of extra.monthlyPremiums) {row.enrolleePremium='200.02';row.advancePremiumTaxCredit='0';}
  input.form1095A.push(extra);rebindPolicies(input);
  const {monthly,benchmarks,packet}=sources(input);
  for(const row of monthly.filter(row=>row.month<=7)) row.enrolleePremium='1500.03';
  for(const row of benchmarks.filter(row=>row.owner==='primary')) row.slcsp='433.11';
  const before=JSON.stringify(input),result=calculateForm8962MarriageSources(input);
  expect(result.families[0].months.map(row=>[row.premium.toFixed(),row.slcsp.toFixed()])).toEqual(Array.from({length:7},()=>['500.03','433.11']));
  expect(result.months[0].premium.toFixed()).toBe('1500.03');expect(JSON.stringify(input)).toBe(before);
  packet.policies=known(packet.policies).toReversed();packet.benchmarks=known(packet.benchmarks).toReversed();
  expect(calculateForm8962MarriageSources(input)).toEqual(result);
});
it('derives only actual covered alternative intervals and preserves zero source months',()=>{
  const input=marriageSourcesFixture();input.form1095A.splice(1,1);
  const primary=input.form1095A[0];known(primary.coveredIndividuals)[0].firstMonth=2;
  Object.assign(primary.monthlyPremiums[0],{enrolleePremium:'0',slcsp:'0',advancePremiumTaxCredit:'0'});
  rebindPolicies(input);
  const {packet,monthly}=sources(input);
  packet.benchmarks=known(packet.benchmarks).filter(row=>row.owner==='primary'&&known(row.month)>=2);
  for(const row of monthly.filter(row=>row.month<=7)) Object.assign(row,{enrolleePremium:'500',slcsp:'433',advancePremiumTaxCredit:'270'});
  Object.assign(monthly[0],{enrolleePremium:'0',slcsp:'0',advancePremiumTaxCredit:'0',coverageEligible:false});
  const before=JSON.stringify(input),result=calculateForm8962MarriageSources(input);
  expect(result.families.map(row=>[row.owner,row.familySize,row.months.map(month=>month.month)]))
    .toEqual([['primary',1,[2,3,4,5,6,7]],['spouse',3,[]]]);
  expect(result.months.map(row=>row.month)).toEqual([2,3,4,5,6,7,8,9,10,11,12]);
  expect(JSON.stringify(input)).toBe(before);
});
