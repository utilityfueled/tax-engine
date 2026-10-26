// Spec: spec/federal/form-8962-no-advance-allocation.yaml. Synthetic source records.
import { expect, it } from 'vitest';
import { calculateForm8962SharedPolicy } from '@/engine/forms/form-8962-shared-policy.js';
import { calculateFederalTax } from '@/engine/federal.js';
import { TaxYearInputSchema } from '@/models/inputs.js';
import { sharedNoAdvanceFixture } from '../../fixtures/shared-no-advance-policy.js';
import { sharedPolicyFixture } from '../../fixtures/shared-policy.js';

function packet(input:ReturnType<typeof sharedNoAdvanceFixture>){return input.form8962!.sharedPolicyAllocations!.policies![0];}
function sync(input:ReturnType<typeof sharedNoAdvanceFixture>){packet(input).original=structuredClone(input.form1095A[0]);}

it('matches the published Situation3 ratio without using the rounded printed share',()=>{
  const input=sharedNoAdvanceFixture();
  input.form1095A[0].monthlyPremiums=[{month:1,enrolleePremium:'15000',slcsp:'0',advancePremiumTaxCredit:'0'}];
  input.form1095A[0].coveredIndividuals!.forEach(row=>{row.lastMonth=1;});
  const benchmarks=packet(input).noAdvanceAllocation!.monthlyBenchmarks!;
  packet(input).noAdvanceAllocation!.monthlyBenchmarks=[{...benchmarks[0],thisReturnSlcsp:'12000',otherReturnSlcsp:'6000'}];sync(input);
  const own=calculateForm8962SharedPolicy(input);
  expect(own.months.map(row=>[row.premium.toFixed(),row.slcsp.toFixed(),row.advance.toFixed()])).toEqual([['10000','12000','0']]);
  expect(own.periods[0].fraction.toFixed(2)).toBe('0.67');
  const other=structuredClone(input);other.taxpayer.primary={...other.taxpayer.primary,firstName:'Robin',lastName:'Other',ssn:'234-56-7890'};
  other.form8962!.sharedPolicyAllocations!.primaryName='Robin Other';other.form8962!.sharedPolicyAllocations!.primarySsn='234-56-7890';
  packet(other).otherTaxpayerName='Jane Doe';packet(other).otherTaxpayerSsn='123-45-6789';
  packet(other).coveredFamilyAssignments!.forEach(row=>{row.family=row.family==='this_return'?'other_return':'this_return';});
  packet(other).noAdvanceAllocation!.monthlyBenchmarks!.forEach(row=>{
    [row.thisReturnSlcsp,row.otherReturnSlcsp]=[row.otherReturnSlcsp,row.thisReturnSlcsp];
    [row.thisReturnCoveredIndividualSsns,row.otherReturnCoveredIndividualSsns]=[row.otherReturnCoveredIndividualSsns,row.thisReturnCoveredIndividualSsns];
  });
  const reverse=calculateForm8962SharedPolicy(other);
  expect(reverse.months[0].premium.toFixed()).toBe('5000');expect(reverse.months[0].slcsp.toFixed()).toBe('6000');expect(reverse.periods[0].fraction.toFixed(2)).toBe('0.33');
  expect(own.months[0].premium.plus(reverse.months[0].premium).toFixed()).toBe('15000');
});

it('retains monthly benchmark changes exact cents and known blank originals',()=>{
  const input=sharedNoAdvanceFixture();
  input.form1095A[0].monthlyPremiums[0].slcsp=null;input.form1095A[0].monthlyPremiums[0].enrolleePremium='9007199254740993.01';
  packet(input).noAdvanceAllocation!.monthlyBenchmarks![0].thisReturnSlcsp='1';packet(input).noAdvanceAllocation!.monthlyBenchmarks![0].otherReturnSlcsp='3';sync(input);
  const parsed=TaxYearInputSchema.parse(input),before=JSON.stringify(parsed),result=calculateForm8962SharedPolicy(parsed);
  expect(result.months[0].premium.toFixed()).toBe('2251799813685248.2525');expect(result.months[0].slcsp.toFixed()).toBe('1');
  expect(result.months[0].originalSlcsp).toBeNull();
  expect(result.periods.map(row=>[row.firstMonth,row.lastMonth,row.fraction.toFixed(2)])).toEqual([[1,1,'0.25'],[2,12,'0.67']]);
  expect(parsed.form1095A[0].monthlyPremiums[0].slcsp).toBeNull();expect(JSON.stringify(parsed)).toBe(before);
});

it('requires actual zero advances and complete independently bound benchmark sources',()=>{
  const changes:Array<(input:ReturnType<typeof sharedNoAdvanceFixture>)=>void>=[
    input=>{input.form1095A[0].monthlyPremiums[0].advancePremiumTaxCredit='.01';sync(input);},
    input=>{packet(input).noAdvanceAllocation=undefined;},
    input=>{packet(input).noAdvanceAllocation!.sourceTaxYear=2024;},
    input=>{packet(input).noAdvanceAllocation!.sourceFactsConfirmed=undefined;},
    input=>{packet(input).noAdvanceAllocation!.allCoveredPeopleInCoverageFamiliesConfirmed=false;},
    input=>{packet(input).noAdvanceAllocation!.monthlyBenchmarks!.pop();},
    input=>{packet(input).noAdvanceAllocation!.monthlyBenchmarks![0].otherReturnSourceReference='';},
    input=>{packet(input).noAdvanceAllocation!.monthlyBenchmarks![0].thisReturnCoveredIndividualSsns=['234-56-7890'];},
    input=>{packet(input).noAdvanceAllocation!.monthlyBenchmarks![0].otherReturnSlcsp='0';},
    input=>{packet(input).noAdvanceAllocation!.monthlyBenchmarks![0].thisReturnSlcsp='NaN';},
    input=>{packet(input).monthlyAllocations=[{month:1,fraction:'.67'}];},
    input=>{packet(input).agreementConfirmed=true;},
    input=>{packet(input).agreementReference='Current agreement';},
    input=>{packet(input).defaultAllocation={sourceReference:'Enrollment',enrollingTaxpayerSsn:'123-45-6789',allCoveredPeopleEnrolledByTaxpayerConfirmed:true};},
    input=>{input.form1095A[0].monthlyPremiums[0].slcsp=null;},
  ];
  for(const mutate of changes){const input=sharedNoAdvanceFixture();mutate(input);expect(()=>calculateForm8962SharedPolicy(input)).toThrow();}
  const missing=sharedNoAdvanceFixture();delete (missing.form1095A[0].monthlyPremiums[0] as {slcsp?:string|null}).slcsp;
  expect(()=>TaxYearInputSchema.parse(missing)).toThrow();
  const unrelated=sharedPolicyFixture();unrelated.form1095A[0].monthlyPremiums[0].slcsp=null;packet(unrelated).original=structuredClone(unrelated.form1095A[0]);
  expect(()=>calculateForm8962SharedPolicy(TaxYearInputSchema.parse(unrelated))).toThrow();
});

it('uses actual no-advance sources canonically and rejects stale reconciliation',()=>{
  const input=sharedNoAdvanceFixture();input.form1095A[0].monthlyPremiums[0].slcsp=null;sync(input);
  const result=calculateFederalTax(TaxYearInputSchema.parse(input));
  expect(result.form8962!.ptcAllowed.toFixed()).toBe('12000');expect(result.form8962!.advancePTCTotal.toFixed()).toBe('0');expect(result.form8962!.netPTC.toFixed()).toBe('12000');
  input.form8962!.monthlyReconciliation![0].enrolleePremium='1005';expect(()=>calculateFederalTax(input)).toThrow(/exceeds source enrollment premiums/);
  input.form8962!.monthlyReconciliation![0].enrolleePremium='1000';input.form8962!.monthlyReconciliation![0].slcsp='1675';expect(()=>calculateFederalTax(input)).toThrow(/source-derived/);
  input.taxpayer.taxYear=2026;expect(()=>calculateFederalTax(input)).toThrow(/2026|readiness/);
});
