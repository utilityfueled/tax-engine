// Spec: spec/federal/shared-marketplace-health-other-allocations.yaml.
import { expect, it } from 'vitest';
import { calculateSharedMarketplaceHealthSources } from '@/engine/forms/shared-marketplace-health.js';
import { calculateForm8962SharedPolicy } from '@/engine/forms/form-8962-shared-policy.js';
import { calculateFederalTax } from '@/engine/federal.js';
import { defaultSharedHealthInput, noAdvanceSharedHealthInput } from '../../fixtures/shared-marketplace-health-other-allocations.js';

it('uses actual default enrollment allocation with independently paid health sources', () => {
  const input = defaultSharedHealthInput(), original = structuredClone(input);
  const result = calculateSharedMarketplaceHealthSources(input)!;
  expect([...result.values()][0].months.get(1)!.premium.toFixed()).toBe('500');
  expect([...result.values()][0].months.get(1)!.advance.toFixed()).toBe('300');
  expect(input).toEqual(original);
  input.form8962!.sharedPolicyAllocations!.policies![0].defaultAllocation!.allCoveredPeopleEnrolledByTaxpayerConfirmed = undefined;
  expect(() => calculateSharedMarketplaceHealthSources(input)).toThrow(/enroll|confirm/i);
  const bad = defaultSharedHealthInput(), payment = bad.form7206!.plans![0].payments![0];
  payment.ownerOrBusinessPaid = '201'; payment.otherPersonPaid = '199'; payment.personAmounts![0].amountPaid = '201';
  expect(() => calculateSharedMarketplaceHealthSources(bad)).toThrow(/paid|reconcile/i);
});
it('uses exact no-advance benchmark allocation without inferring actual cash', () => {
  const input = noAdvanceSharedHealthInput(), original = structuredClone(input);
  expect(calculateForm8962SharedPolicy(input).periods[0].fraction.toFixed()).toBe('0.67');
  const result = calculateSharedMarketplaceHealthSources(input)!;
  expect([...result.values()][0].months.get(1)!.premium.toFixed()).toBe('1000');
  expect([...result.values()][0].months.get(1)!.advance.toFixed()).toBe('0');
  expect(input).toEqual(original);
  for (const mutate of [
    (i: ReturnType<typeof noAdvanceSharedHealthInput>) => { i.form7206!.plans![0].payments![0].otherPersonPaid = undefined; },
    (i: ReturnType<typeof noAdvanceSharedHealthInput>) => { const p=i.form7206!.plans![0].payments![0]; p.ownerOrBusinessPaid='1005'; p.otherPersonPaid='495'; p.personAmounts![0].amountPaid='1005'; },
    (i: ReturnType<typeof noAdvanceSharedHealthInput>) => { i.form8962!.sharedPolicyAllocations!.policies![0].noAdvanceAllocation!.monthlyBenchmarks![0].otherReturnSlcsp = '501'; },
  ]) { const bad = noAdvanceSharedHealthInput(); mutate(bad); expect(() => calculateSharedMarketplaceHealthSources(bad)).toThrow(/source|paid|payment|reconcile|allocation/i); }
});
it('reconciles linked no-advance originals against one complete actual coverage-family benchmark',()=>{
  const input=noAdvanceSharedHealthInput(),packet=input.form8962!.sharedPolicyAllocations!,first=input.form1095A![0];
  first.monthlyPremiums.forEach(row=>{row.enrolleePremium='750';});
  packet.policies![0].original=structuredClone(first);
  const second=structuredClone(first);second.policyNumber='ACTUAL-SECOND-NO-ADVANCE';input.form1095A!.push(second);
  packet.policies!.push({...structuredClone(packet.policies![0]),sourceId:'form1095A:1',original:structuredClone(second)});
  packet.noAdvanceCoverageFamilies={sourceTaxYear:2025,sourceReference:'Actual complete monthly family records',sourceFactsConfirmed:true,allBenchmarkMonthsIncluded:true,
    months:first.monthlyPremiums.map(row=>({month:row.month,families:[
      {taxpayerName:'Jane Doe',taxpayerSsn:'123-45-6789',sourceReference:'Actual Jane complete coverage',allCoverageFamilyMembersIncludedConfirmed:true,allCoveragePoliciesIncludedConfirmed:true,
        groups:[{sourceId:'own-coverage',sourceReference:'Actual full own benchmark',ratingArea:'WA-area-1',slcsp:'1000',coveredIndividualSsns:['123-45-6789'],allCoveredPeopleShareRatingAreaConfirmed:true}]},
      {taxpayerName:'Robin Other',taxpayerSsn:'234-56-7890',sourceReference:'Actual Robin complete coverage',allCoverageFamilyMembersIncludedConfirmed:true,allCoveragePoliciesIncludedConfirmed:true,
        groups:[{sourceId:'other-coverage',sourceReference:'Actual full other benchmark',ratingArea:'WA-area-1',slcsp:'500',coveredIndividualSsns:['234-56-7890'],allCoveredPeopleShareRatingAreaConfirmed:true}]},
    ]}))};
  input.form7206!.plans![0].marketplacePolicySourceIds!.push('form1095A:1');
  const before=structuredClone(input),result=calculateFederalTax(input);
  expect([result.schedule1!.seHealthInsurance.toFixed(),result.form8962!.ptcAllowed.toFixed()]).toEqual(['1080','9264']);
  expect([...calculateSharedMarketplaceHealthSources(input)!.values()][0].months.get(1)!.premium.toFixed()).toBe('1000');
  expect(input).toEqual(before);
  input.form7206!.plans![0].marketplacePolicySourceIds!.reverse();packet.policies!.reverse();
  expect(calculateFederalTax(input).form8962!.ptcAllowed.toFixed()).toBe('9264');
  packet.noAdvanceCoverageFamilies=undefined;
  expect(()=>calculateSharedMarketplaceHealthSources(input)).toThrow(/complete|famil|source/i);
});
