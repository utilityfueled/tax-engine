// Spec: spec/federal/marketplace-marriage-coverage-family.yaml.
import { expect,it } from 'vitest';
import { calculateForm8962MarriageSources } from '@/engine/forms/form-8962-marriage-sources.js';
import { calculateMarketplaceMarriageHealthSources } from '@/engine/forms/marketplace-marriage-health-sources.js';
import { calculateForm8962MarriageWorksheets } from '@/engine/forms/form-8962-marriage-worksheets.js';
import { d,sum } from '@/utils/decimal.js';
import { marriageCoverageFamilyInput } from '../../fixtures/marketplace-marriage-coverage-family.js';

it('binds actual eligible marriage members while retaining full enrollment sources',()=>{
 const input=marriageCoverageFamilyInput(), before=JSON.stringify(input);
 const result=calculateMarketplaceMarriageHealthSources(input);
 expect(result.months).toHaveLength(12);
 expect(sum(...result.months.map(row=>row.premium)).toFixed()).toBe('12000');
 expect(sum(...result.months.map(row=>row.advance)).toFixed()).toBe('7000');
 expect(result.months.filter(row=>!row.coverageEligible).map(row=>row.month)).toEqual([2,12]);
 expect(result.families[0].months.map(row=>row.month)).toEqual([1,2,3,4,5,6,7]);
 expect(result.families[0].months[1].premium.toFixed()).toBe('1000');
 expect(result.families[0].months[1].slcsp.toFixed()).toBe('0');
 expect(result.families[0].months[1].coverageEligible).toBe(false);
 expect(JSON.stringify(input)).toBe(before);
});
it('keeps actual shared allocation before monthly marriage membership',()=>{
 const input=marriageCoverageFamilyInput(true), before=JSON.stringify(input),result=calculateMarketplaceMarriageHealthSources(input);
 expect(sum(...result.months.map(row=>row.premium)).toFixed()).toBe('12000');
 expect(sum(...input.form1095A[0].monthlyPremiums.map(row=>d(row.enrolleePremium)))).toEqual(d('24000'));
 expect(result.families[0].months[1].coverageEligible).toBe(false);
 expect(result.months[11].slcsp.toFixed()).toBe('0');
 expect(JSON.stringify(input)).toBe(before);
});
it('starts at the actual first full QHP month without dropping earlier premiums',()=>{
 const input=marriageCoverageFamilyInput(false,true),result=calculateMarketplaceMarriageHealthSources(input);
 expect(result.families[0].months.map(row=>row.month)).toEqual([2,3,4,5,6,7]);
 expect(result.families[0].months[0].coverageEligible).toBe(false);
 expect(result.months[0].premium.toFixed()).toBe('1000');
 expect(result.months[0].coverageEligible).toBe(false);
 const worksheet=calculateForm8962MarriageWorksheets({...result,taxYear:2025,fplRegion:'contiguous',householdIncome:d('80000')});
 expect(worksheet.families[0].startMonth).toBe(2);
 expect(worksheet.families[0].stopMonth).toBe(7);
 expect(worksheet.months[0].credit.toFixed()).toBe('0');
 expect(worksheet.advancePTCTotal.toFixed()).toBe('6300');
});
it('rejects missing contradictory and stale marriage eligibility sources',()=>{
 const edits=[
  (x:ReturnType<typeof marriageCoverageFamilyInput>)=>{x.form7206!.plans![0].coverageFamilySources=undefined;},
  (x:ReturnType<typeof marriageCoverageFamilyInput>)=>{x.form7206!.plans![0].coverageFamilySources!.months![0].personFacts![0].otherMecEligible=undefined;},
  (x:ReturnType<typeof marriageCoverageFamilyInput>)=>{x.form7206!.plans![0].coverageFamilySources!.months!.pop();},
  (x:ReturnType<typeof marriageCoverageFamilyInput>)=>{x.form8962!.marriageSources!.policies![0].allCoveredIndividualsEligibleForPtcConfirmed=true;},
  (x:ReturnType<typeof marriageCoverageFamilyInput>)=>{x.form1095A[0].policyNumber='Changed original';},
  (x:ReturnType<typeof marriageCoverageFamilyInput>)=>{x.form8962!.monthlyReconciliation![0].slcsp='800.01';},
  (x:ReturnType<typeof marriageCoverageFamilyInput>)=>{x.form8962!.marriageSources!.benchmarks![1].slcsp='0.01';},
 ];
 for(const edit of edits){const input=marriageCoverageFamilyInput();edit(input);const before=JSON.stringify(input);expect(()=>calculateForm8962MarriageSources(input)).toThrow();expect(JSON.stringify(input)).toBe(before);}
});
