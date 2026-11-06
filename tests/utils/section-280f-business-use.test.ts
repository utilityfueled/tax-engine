/** Spec: spec/federal/section-280f-business-use.yaml, worksheet lines7-9. */
import {expect,it} from 'vitest';
import {DepreciableAssetSchema} from '@/models/inputs.js';
import {computeListedPropertyDepreciation} from '@/utils/macrs.js';
const asset=(year:number,use:number,bonus=false,cost='1000000')=>DepreciableAssetSchema.parse({description:'Fictional passenger automobile',costBasis:cost,placedInServiceDate:`${year}-06-15`,recoveryPeriod:'5',method:'200DB',convention:'halfYear',isListedProperty:true,isPassengerAutomobile:true,businessUsePercentage:use,firstYearBonusEligible:bonus});
it('reduces the passenger maximum by actual annual business use',()=>{
 // Independent literal worksheet results from published original-year limits.
 for(const [year,use,bonus,expected] of [[2025,75,false,'9150'],[2026,75,false,'9225'],[2025,75,true,'15150'],[2026,75,true,'15225'],[2025,50.5,false,'6161'],[2026,50.5,false,'6212'],[2025,50,false,'6100'],[2026,12.345,false,'1518'],[2026,99.99,true,'20298'],[2026,0,false,'0']] as const){
  const input=asset(year,use,bonus),before=JSON.stringify(input),out=computeListedPropertyDepreciation(input,year);
  expect(out?.section280FCap?.toString(),`${year}/${use}/${bonus}`).toBe(expected);expect(out?.depreciation.toString()).toBe(expected);expect(out?.basisSourceStatus).toBe('legacy_unqualified');expect(JSON.stringify(input)).toBe(before);
 }
});
it('preserves nonbinding amounts original placement year and legacy status',()=>{
 const below=computeListedPropertyDepreciation(asset(2025,75,false,'10000'),2025);expect(below?.tentativeDepreciation.toString()).toBe('1500');expect(below?.depreciation.toString()).toBe('1500');expect(below?.section280FCap?.toString()).toBe('9150');
 const later=computeListedPropertyDepreciation(asset(2025,75),2026);expect(later?.section280FCap?.toString()).toBe('14700');expect(later?.depreciation.toString()).toBe('14700');
 const full=computeListedPropertyDepreciation(asset(2026,100),2026);expect(full?.section280FCap?.toString()).toBe('12300');
 const other=computeListedPropertyDepreciation({...asset(2026,75),isPassengerAutomobile:false},2026);expect(other?.section280FCap).toBeNull();expect(other?.depreciation.toString()).toBe('150000');
});
