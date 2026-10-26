// Spec: spec/federal/form-8962-no-advance-overlap.yaml
import {expect,it} from 'vitest';
import {TaxYearInputSchema} from '@/models/inputs.js';
import {calculateFederalTax} from '@/engine/federal.js';
import {calculateForm8962SharedPolicy} from '@/engine/forms/form-8962-shared-policy.js';
import {noAdvanceOverlapFixture,noAdvanceOverlapRaw} from '../../fixtures/no-advance-overlap.js';
it('allocates overlapping original premiums from full family benchmarks once',()=>{
 const input=noAdvanceOverlapFixture(),before=JSON.stringify(input),result=calculateForm8962SharedPolicy(input);
 expect(result.months.map(row=>row.premium.toFixed())).toEqual(['400','600']);expect(result.householdMonths[0].premium.toFixed()).toBe('1000');expect(result.householdMonths[0].slcsp.toFixed()).toBe('1200');expect(result.householdMonths[0].advance.toFixed()).toBe('0');expect(result.periods.map(row=>row.fraction.toFixed())).toEqual(['0.67','0.67']);expect(JSON.stringify(input)).toBe(before);
});
it('rejects incomplete duplicate and contradictory full-family monthly sources',()=>{
 const mutations=[(x:ReturnType<typeof noAdvanceOverlapRaw>)=>{x.form8962.sharedPolicyAllocations.noAdvanceCoverageFamilies.sourceFactsConfirmed=false;},
 (x:ReturnType<typeof noAdvanceOverlapRaw>)=>{x.form8962.sharedPolicyAllocations.noAdvanceCoverageFamilies.months[0].families[1].allCoveragePoliciesIncludedConfirmed=false;},
 (x:ReturnType<typeof noAdvanceOverlapRaw>)=>{x.form8962.sharedPolicyAllocations.noAdvanceCoverageFamilies.months[0].families[0].groups[0].coveredIndividualSsns.pop();},
 (x:ReturnType<typeof noAdvanceOverlapRaw>)=>{x.form8962.sharedPolicyAllocations.noAdvanceCoverageFamilies.months.push(structuredClone(x.form8962.sharedPolicyAllocations.noAdvanceCoverageFamilies.months[0]));},
 (x:ReturnType<typeof noAdvanceOverlapRaw>)=>{x.form8962.sharedPolicyAllocations.noAdvanceCoverageFamilies.months[0].families[1].taxpayerName='Different source person';},
 (x:ReturnType<typeof noAdvanceOverlapRaw>)=>{x.form8962.sharedPolicyAllocations.policies![1].noAdvanceAllocation!.monthlyBenchmarks![0].otherReturnSlcsp='600.01';}];
 for(const mutate of mutations){const raw=noAdvanceOverlapRaw();mutate(raw);expect(()=>calculateForm8962SharedPolicy(TaxYearInputSchema.parse(raw))).toThrow(/coverage|benchmark|family|families|source|month/i);}
 const missing=noAdvanceOverlapRaw();delete (missing.form8962.sharedPolicyAllocations as {noAdvanceCoverageFamilies?:unknown}).noAdvanceCoverageFamilies;expect(()=>calculateForm8962SharedPolicy(TaxYearInputSchema.parse(missing))).toThrow(/coverage|benchmark|family|families/i);
});
it('uses actual location groups and exact source cents without a printed-ratio residual',()=>{
 const raw=noAdvanceOverlapRaw(),families=raw.form8962.sharedPolicyAllocations.noAdvanceCoverageFamilies.months[0].families;
 families[0].groups=[{...families[0].groups[0],slcsp:'500',coveredIndividualSsns:['123-45-6789']},{...families[0].groups[0],sourceId:'own-or',sourceReference:'Actual Oregon benchmark',ratingArea:'OR-area-2',slcsp:'700',coveredIndividualSsns:['345-67-8901']}];
 families[1].groups=[{...families[1].groups[0],slcsp:'600',coveredIndividualSsns:['234-56-7890']},{...families[1].groups[0],sourceId:'other-or',sourceReference:'Actual other Oregon benchmark',ratingArea:'OR-area-2',slcsp:'300',coveredIndividualSsns:['456-78-9012']}];
 for(const row of raw.form8962.sharedPolicyAllocations.policies!)row.noAdvanceAllocation!.monthlyBenchmarks![0].otherReturnSlcsp='900';
 for(const [i,amount] of ['900.00000000000000000001','1200.00000000000000000002'].entries()){raw.form1095A[i].monthlyPremiums[0].enrolleePremium=amount;raw.form8962.sharedPolicyAllocations.policies![i].original!.monthlyPremiums![0].enrolleePremium=amount;}
 const result=calculateForm8962SharedPolicy(TaxYearInputSchema.parse(raw));expect(result.householdMonths[0].slcsp.toFixed()).toBe('1200');expect(result.householdMonths[0].premium.gt('1200')).toBe(true);expect(result.householdMonths[0].premium.lt('1200.00000000000000000002')).toBe(true);expect(result.periods.map(row=>row.fraction.toFixed())).toEqual(['0.57','0.57']);
});
it('combines no-advance and actual unshared coverage without duplicating the benchmark',()=>{
 const raw=noAdvanceOverlapRaw(),packet=raw.form8962.sharedPolicyAllocations,second=raw.form1095A[1];
 second.coveredIndividuals=second.coveredIndividuals!.filter(person=>person.ssn==='345-67-8901');second.monthlyPremiums=[{month:1,enrolleePremium:'600',slcsp:'1200',advancePremiumTaxCredit:'100'}];
 packet.policies![1]={sourceId:'form1095A:1',original:structuredClone(second),situation:'not_shared',unsharedSourceReference:'Actual unshared statement',allCoveredPeopleInThisTaxFamilyConfirmed:true,originalSlcspCorrectConfirmed:true};
 const family=packet.noAdvanceCoverageFamilies.months[0].families[1];family.groups[0].coveredIndividualSsns=['234-56-7890'];
 packet.policies![0].noAdvanceAllocation!.monthlyBenchmarks![0].otherReturnCoveredIndividualSsns=['234-56-7890'];
 const result=calculateForm8962SharedPolicy(TaxYearInputSchema.parse(raw));expect(result.householdMonths[0].premium.toFixed()).toBe('1000');expect(result.householdMonths[0].slcsp.toFixed()).toBe('1200');expect(result.householdMonths[0].advance.toFixed()).toBe('100');expect(result.periods).toHaveLength(1);
});
it('reconciles the canonical household month to complete original sources',()=>{
 const input=noAdvanceOverlapFixture(),result=calculateFederalTax(input);expect(result.agi.toFixed()).toBe('30000');expect(result.form8962?.ptcAllowed.toFixed()).toBe('1000');expect(result.form8962?.advancePTCTotal.toFixed()).toBe('0');
 const changed=structuredClone(input);changed.form8962!.monthlyReconciliation![0].slcsp='2400';expect(()=>calculateFederalTax(changed)).toThrow(/source|reconcil/i);
});
it('preserves distinct counterpart families and later single-policy months',()=>{
 const raw=noAdvanceOverlapRaw(),packet=raw.form8962.sharedPolicyAllocations,families=packet.noAdvanceCoverageFamilies.months[0].families;
 packet.policies![1].otherTaxpayerName='Taylor Roe';packet.policies![1].otherTaxpayerSsn='456-78-9012';
 families[1].groups[0].coveredIndividualSsns=['234-56-7890'];families.push({...structuredClone(families[1]),taxpayerName:'Taylor Roe',taxpayerSsn:'456-78-9012',groups:[{...structuredClone(families[1].groups[0]),sourceId:'third-family-wa',coveredIndividualSsns:['456-78-9012'],slcsp:'300'}]});
 packet.policies![0].noAdvanceAllocation!.monthlyBenchmarks![0].otherReturnCoveredIndividualSsns=['234-56-7890'];packet.policies![1].noAdvanceAllocation!.monthlyBenchmarks![0].otherReturnCoveredIndividualSsns=['456-78-9012'];packet.policies![1].noAdvanceAllocation!.monthlyBenchmarks![0].otherReturnSlcsp='300';
 const first=raw.form1095A[0];first.coveredIndividuals!.forEach(person=>{person.lastMonth=2;});first.monthlyPremiums.push({month:2,enrolleePremium:'1100',slcsp:null,advancePremiumTaxCredit:'0'});packet.policies![0].original=structuredClone(first);
 packet.policies![0].noAdvanceAllocation!.monthlyBenchmarks!.push({month:2,thisReturnSlcsp:'500',otherReturnSlcsp:'600',thisReturnSourceReference:'Actual February Jane benchmark',otherReturnSourceReference:'Actual February Robin benchmark',thisReturnCoveredIndividualSsns:['123-45-6789'],otherReturnCoveredIndividualSsns:['234-56-7890']});
 const input=TaxYearInputSchema.parse(raw),result=calculateForm8962SharedPolicy(input);expect(result.householdMonths.map(row=>[row.month,row.premium.toFixed(),row.slcsp.toFixed()])).toEqual([[1,'1120','1200'],[2,'500','500']]);
 const reverse=structuredClone(input);reverse.form8962!.sharedPolicyAllocations!.policies!.reverse();reverse.form8962!.sharedPolicyAllocations!.noAdvanceCoverageFamilies!.months![0].families!.reverse();expect(calculateForm8962SharedPolicy(reverse).householdMonths).toEqual(result.householdMonths);
 const future=structuredClone(input);future.taxpayer.taxYear=2026;future.form8962!.sharedPolicyAllocations!.sourceTaxYear=2026;future.form8962!.sharedPolicyAllocations!.noAdvanceCoverageFamilies!.sourceTaxYear=2026;future.form1095A.forEach(policy=>{policy.taxYear=2026;});future.form8962!.sharedPolicyAllocations!.policies!.forEach(policy=>{policy.original!.taxYear=2026;policy.noAdvanceAllocation!.sourceTaxYear=2026;});expect(calculateForm8962SharedPolicy(future).householdMonths.map(row=>row.premium.toFixed())).toEqual(['1120','500']);
});
