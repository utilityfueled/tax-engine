// spec/federal/macrs-native-first-year-ordinary.yaml#inventory
import {it,expect} from 'vitest';
import {TaxYearInputSchema,type TaxYearInput} from '@/models/inputs';
import {calculateScheduleC} from '@/engine/schedules/schedule-c';
import {calculateScheduleCSourceFacts} from '@/engine/schedules/schedule-c-source-facts';
import {buildTaxInputFromGuidedData} from '@/lib/guided-interview-bridge';
import {macrsFixture,macrsDraft,macrsRow} from '../../fixtures/macrs-native-first-year';
import {confirmGuidedMacrsAsset,confirmGuidedMacrsCollection} from '@/lib/guided-macrs-assets';
const original=()=>TaxYearInputSchema.parse(buildTaxInputFromGuidedData(macrsFixture().state));
it('canonical source packet checks current owner activity year and every original before zero paths',()=>{
 const mutations:Array<(i:TaxYearInput)=>void>=[
 i=>{delete i.scheduleC!.sourceFacts!.depreciation;},i=>{i.scheduleC!.sourceFacts!.depreciation!.sourceTaxYear=2026;},
 i=>{i.scheduleC!.sourceFacts!.depreciation!.rows![0].accountHolder='spouse';},i=>{i.scheduleC!.principalBusinessActivity='Another business';},
 i=>{i.scheduleC!.sourceFacts!.depreciation!.rows=[];},i=>{i.scheduleC!.sourceFacts!.depreciation!.rows!.push(structuredClone(i.scheduleC!.sourceFacts!.depreciation!.rows![0]));},
 i=>{i.scheduleC!.sourceFacts!.depreciation!.rows![0].bonusTreatmentSourceReference='';},i=>{i.scheduleC!.sourceFacts!.depreciation!.rows![0].bonusZeroTreatment=undefined;},
 i=>{(i.form4562!.assets![0].basisSources as unknown as Record<string,unknown>).confirmed=false;},i=>{i.form4562!.assets![0].basisSources!.grossCostBasis='0';},
 i=>{i.scheduleC!.expenses!.depreciation='1200';},i=>{delete (i.form4562 as unknown as Record<string,unknown>).specialDepreciationAllowance;},
 i=>{i.scheduleC!.sourceFacts!.depreciation!.noOtherActivityAssetsConfirmed=null;},i=>{i.scheduleC!.sourceFacts!.depreciation!.rows![0].assetIndex=1;},
 i=>{i.form4562!.taxYear=2026;},i=>{i.scheduleC!.sourceFacts!.depreciation!.sourceFactsConfirmed=null;},
 ];
 for(const mutate of mutations){const i=original();mutate(i);const before=JSON.stringify(i);expect(()=>calculateScheduleC(i,i.scheduleC)).toThrow();expect(JSON.stringify(i)).toBe(before);}
});
it('fresh actual source binding refuses stale saved result after equal-cash original reference changes',()=>{
 const i=original(),saved=calculateScheduleC(i,i.scheduleC);expect(calculateScheduleCSourceFacts(i,i.scheduleC,saved)?.commitment).toMatch(/^[a-f0-9]{64}$/);
 const p=i.scheduleC!.sourceFacts!.depreciation!;p.sourceReference='another-current-original';
 expect(()=>calculateScheduleCSourceFacts(i,i.scheduleC,saved)).toThrow(/stale/);
 delete i.scheduleC!.sourceFacts;expect(()=>calculateScheduleCSourceFacts(i,i.scheduleC,saved)).toThrow();
});
it('competing current activity refuses the aggregate-convention shortcut without echoing private values',()=>{
 const i=original();for(const extra of [{rentalProperties:[{}]},{scheduleF:{}},{royaltyPropertySources:{}}]){
 const input={...i,...extra};try{calculateScheduleCSourceFacts(input as never,i.scheduleC);throw Error('did not reject');}catch(e){expect(String(e)).toContain('other activities');expect(String(e)).not.toContain('fictional-invoice-private-marker');}
 }
});

it('zero current deduction still requires complete actual canonical inventory originals',()=>{const f=macrsFixture(),d=macrsDraft([macrsRow({grossCostBasis:'0',businessUsePercentage:'0'})]);d.rows=d.rows!.map(row=>confirmGuidedMacrsAsset(row,d));f.facts.macrsAssets=confirmGuidedMacrsCollection(d,f.facts);const input=TaxYearInputSchema.parse(buildTaxInputFromGuidedData(f.state));expect(calculateScheduleC(input,input.scheduleC).form4562?.line22.toString()).toBe('0');input.scheduleC!.sourceFacts!.depreciation!.rows=[];expect(()=>calculateScheduleC(input,input.scheduleC)).toThrow(/complete unique original/);});
