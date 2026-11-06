// Spec: spec/federal/marketplace-marriage-outside-person.yaml.
import { expect, it } from 'vitest';
import { calculateFederalTax } from '@/engine/federal';
import { calculateForm8962MarriageSources } from '@/engine/forms/form-8962-marriage-sources';
import { d, sum } from '@/utils/decimal';
import { marriageOutsidePersonInput } from '../fixtures/marketplace-marriage-outside-person';

it('composes actual outside child cash with allocated marriage and later own advances', () => {
  const input=marriageOutsidePersonInput(), before=structuredClone(input), result=calculateFederalTax(input);
  expect([result.schedule1!.seHealthInsurance,result.agi,result.form8962!.ptcAllowed,result.form8962!.excessAPTCRepayment].map(v=>v.toFixed())).toEqual(['6875','86060','5192','808']);
  expect(result.marketplaceHealthInsurance!.step2Credit.toFixed()).toBe('5725');
  expect(result.form7206!.businesses[0].medicalPremiums.toFixed()).toBe('600');
  expect(result.form7206!.businesses[0].specifiedPremiums.toFixed(2)).toBe('12000.06');
  expect(calculateForm8962MarriageSources(input).families.map(row=>row.familySize)).toEqual([1,1]);
  expect(result.allLines.filter(row=>row.form==='Pub974 QBI Allocation').map(row=>row.value.toFixed())).toEqual(['6275.06']);
  expect(result.allLines.find(row=>row.form==='QBI Source Deductions' && row.line==='scheduleC')!.inputs['SE health insurance'].toString()).toBe('6875');
  expect(input).toEqual(before);
});
it('requires original owner child relationship before the actual paid coverage', () => {
  for(const patch of [{sourceTaxYear:2024},{sourceReference:''},{sourceFactsConfirmed:false},{accountHolder:'spouse'},
    {ownerSsn:'444-55-6666'},{coveredIndividualSsn:'111-22-3333'},{childRelationship:undefined},
    {relationshipStartDate:undefined},{relationshipStartDate:'2025-02-30'},{relationshipStartDate:'2025-07-15'}]) {
    const input=marriageOutsidePersonInput(), covered=input.form7206!.plans![0].coveredPersons![1];
    Object.assign((covered as unknown as {childRelationshipSources:Record<string,unknown>}).childRelationshipSources,patch);
    expect(()=>calculateFederalTax(input)).toThrow(/relationship|child|source/i);
  }
});
it('preserves zero unknown qualification and other-return credit distinctions', () => {
  const old=marriageOutsidePersonInput();old.form7206!.persons![1].attainedAgeAtYearEnd=27;
  delete (old.form7206!.plans![0].coveredPersons![1] as unknown as {childRelationshipSources?:unknown}).childRelationshipSources;
  old.form7206!.plans![0].coverageFamilySources!.outsidePersonReturns=undefined;
  expect(calculateFederalTax(old).schedule1!.seHealthInsurance.toFixed()).toBe('6338');
  for(const patch of [{form8962Line24:undefined},{form8962Line24:'0.01'},{returnStatus:'draft'}]) {
    const input=marriageOutsidePersonInput(); Object.assign(input.form7206!.plans![0].coverageFamilySources!.outsidePersonReturns![0],patch);
    expect(()=>calculateFederalTax(input)).toThrow(/other.return|credit|completed/i);
  }
  const zero=marriageOutsidePersonInput('0');
  delete (zero.form7206!.plans![0].coveredPersons![1] as unknown as {childRelationshipSources?:unknown}).childRelationshipSources;
  zero.form7206!.plans![0].coverageFamilySources!.outsidePersonReturns=undefined;
  expect(calculateFederalTax(zero).schedule1!.seHealthInsurance.toFixed()).toBe('6338');
});
it('conserves exact cash and actual monthly qualification through source order', () => {
  const input=marriageOutsidePersonInput('100.01'), original=calculateFederalTax(input);
  expect(sum(...original.form7206!.sourceRecords.filter(row=>row.personId==='outside').map(row=>row.eligiblePremium)).toFixed()).toBe('600.06');
  const plan=input.form7206!.plans![0];plan.coverageFamilySources!.months!.reverse();plan.coverageFamilySources!.persons!.reverse();plan.payments!.reverse();plan.coveredPersons!.reverse();input.form7206!.persons!.reverse();
  const reversed=calculateFederalTax(input);
  expect([reversed.schedule1!.seHealthInsurance,reversed.agi,reversed.form8962!.ptcAllowed].map(v=>v.toFixed())).toEqual([original.schedule1!.seHealthInsurance,original.agi,original.form8962!.ptcAllowed].map(v=>v.toFixed()));
  const employer=marriageOutsidePersonInput();Object.assign(employer.form7206!.plans![0].months![0],{employerSubsidizedPlanEligible:true,employerOfferPtcException:'unaffordable',employerCoverageEnrolled:false,employerOfferSourceReference:'Actual unaffordable offer'});
  const actual=calculateFederalTax(employer);
  expect(sum(...actual.form7206!.sourceRecords.filter(row=>row.personId==='outside').map(row=>row.eligiblePremium))).toEqual(d(500));
  expect(employer.form7206!.plans![0].payments![0].personAmounts![1].amountPaid).toBe('100');
});
it('preserves the actual parent owner when joint filer positions change', () => {
  const input=marriageOutsidePersonInput(), original=calculateFederalTax(input);
  const oldPrimary=input.taxpayer.primary;input.taxpayer.primary=input.taxpayer.spouse!;input.taxpayer.spouse=oldPrimary;
  input.scheduleC!.accountHolder='spouse';
  input.form7206!.persons!.find(person=>person.personId==='primary')!.householdRole='spouse';
  const plan=input.form7206!.plans![0];plan.accountHolder='spouse';plan.coveredPersons![1].childRelationshipSources!.accountHolder='spouse';
  for(const packet of [input.form8962!.marriageSources!,input.form8962!.sharedPolicyAllocations!])Object.assign(packet,{
    primaryName:'Blair Example',primarySsn:input.taxpayer.primary.ssn,spouseName:'Avery Example',spouseSsn:input.taxpayer.spouse.ssn});
  for(const month of input.form8962!.marriageSources!.benchmarks!)month.owner='spouse';
  const swapped=calculateFederalTax(input);
  expect([swapped.schedule1!.seHealthInsurance,swapped.agi,swapped.form8962!.ptcAllowed,swapped.form8962!.excessAPTCRepayment].map(v=>v.toFixed())).toEqual(
    [original.schedule1!.seHealthInsurance,original.agi,original.form8962!.ptcAllowed,original.form8962!.excessAPTCRepayment].map(v=>v.toFixed()));
  expect(swapped.allLines.find(row=>row.form==='QBI Source Deductions'&&row.line==='scheduleC')!.inputs.Owner).toBe('spouse');
});
