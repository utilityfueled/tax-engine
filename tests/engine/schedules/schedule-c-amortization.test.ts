/** Spec: spec/federal/schedule-c.yaml#27b-amortization-source and #27b-amortization-conservation. */
import {expect,it} from 'vitest';
import {TaxYearInputSchema} from '@/models/inputs.js';
import {calculateScheduleC} from '@/engine/schedules/schedule-c.js';
import {calculateFederalTax} from '@/engine/federal.js';
import {scheduleCAmortizationFixture,scheduleCAmortizationProof} from '../../fixtures/schedule-c-amortization.js';
const proof=(input:ReturnType<typeof scheduleCAmortizationFixture>)=>(input.scheduleC!.sourceFacts! as unknown as Record<string,unknown>).amortization as ReturnType<typeof scheduleCAmortizationProof> & {reclassification?:Record<string,string>};
it('adds actual attributed Form4562 amortization once to C PartV',()=>{
 for(const year of [2025,2026] as const){const input=scheduleCAmortizationFixture(year),result=calculateScheduleC(input,input.scheduleC);expect(result.form4562!.line44.toFixed()).toBe('600');expect(result.depreciationAndSection179Deduction.toFixed()).toBe('0');expect(result.expenseBreakdown['Other expenses'].toFixed()).toBe('1100');expect(result.totalExpenses.toFixed()).toBe('2100');expect(result.netProfit.toFixed()).toBe('37900');}
 const source=scheduleCAmortizationFixture();expect(calculateFederalTax(source).scheduleC!.netProfit.toFixed()).toBe('37900');const canonical=TaxYearInputSchema.parse(source);expect((canonical.scheduleC!.sourceFacts as unknown as Record<string,unknown>).amortization).toEqual(proof(source));
});
it('uses later actual business start and conserves an already included expense',()=>{
 const input=scheduleCAmortizationFixture();Object.assign(input.form4562!.amortizableAssets![0],{amortizableAmount:'3600',dateAmortizationBegins:'2025-10'});Object.assign(proof(input).rows[0],{acquisitionDate:'2025-01-15',businessStartDate:'2025-10-01',originalAsset:structuredClone(input.form4562!.amortizableAssets![0])});expect(calculateScheduleC(input,input.scheduleC).form4562!.line44.toFixed()).toBe('60');expect(calculateScheduleC(input,input.scheduleC).netProfit.toFixed()).toBe('38440');
 const reclassified=scheduleCAmortizationFixture();delete reclassified.scheduleC!.sourceFacts!.interest!.reclassification;proof(reclassified).reclassification={sourceReference:'Actual historical amortization included ledger',originalOtherExpenses:'1100',amortizationAlreadyIncluded:'600',remainingOtherExpenses:'500'};expect(calculateScheduleC(reclassified,reclassified.scheduleC).totalExpenses.toFixed()).toBe('2100');
});
it('rejects unknown contradictory or duplicated amortization sources',()=>{
 const mutations:Array<(i:ReturnType<typeof scheduleCAmortizationFixture>)=>void>=[i=>{delete (i.scheduleC!.sourceFacts! as unknown as Record<string,unknown>).amortization;},i=>{proof(i).sourceFactsConfirmed=false;},i=>{delete (proof(i) as Partial<ReturnType<typeof scheduleCAmortizationProof>>).sourceTaxYear;},i=>{i.form4562!.taxYear=2024;},i=>{proof(i).rows[0].accountHolder='spouse' as 'primary';},i=>{proof(i).rows[0].originalAsset.amortizableAmount='18001';},i=>{proof(i).rows[0].acquisitionDate='2025-08-01';},i=>{proof(i).rows[0].fullBusinessUseConfirmed=false;},i=>{proof(i).rows[0].noSelfCreatedRelatedPartyAntiChurningForeignLeaseOrDispositionConfirmed=false;},i=>{proof(i).remainingOtherExpenses='500.01';},i=>{proof(i).rows=[];},i=>{proof(i).rows.push(structuredClone(proof(i).rows[0]));},i=>{i.form4562!.amortizableAssets!.push(structuredClone(i.form4562!.amortizableAssets![0]));const row=structuredClone(proof(i).rows[0]);row.assetIndex=1;row.sourceReference='Different ref cannot duplicate same original';proof(i).rows.push(row);},i=>{i.form4562!.amortizableAssets![0].codeSection='174domestic';(proof(i).rows[0].originalAsset as Record<string,unknown>).codeSection='174domestic';},i=>{delete i.form4562!.amortizableAssets;i.form4562!.currentYearAmortization='600';},i=>{proof(i).reclassification={sourceReference:'Contradictory actual ledger',originalOtherExpenses:'1100',amortizationAlreadyIncluded:'500',remainingOtherExpenses:'500'};}];
 for(const mutate of mutations){const input=scheduleCAmortizationFixture();mutate(input);expect(()=>calculateScheduleC(input,input.scheduleC)).toThrow(/amorti|source|asset|year|original|reclass/i);}
});
it('rejects positive unbound legacy PartVI without inventing attribution',()=>{
 const input=scheduleCAmortizationFixture();delete input.scheduleC!.sourceFacts;input.scheduleC!.expenses!.businessInterest='0';input.scheduleC!.expenses!.otherExpenses='0';expect(()=>calculateScheduleC(input,input.scheduleC)).toThrow(/amorti|source|attribut/i);
});

it('does not invent PA amortization from the new federal source',async()=>{
 const {calculatePAReturn,calculatePAScheduleCNetIncome}=await import('@/engine/state/pa-orchestrator.js');const input=scheduleCAmortizationFixture();input.taxpayer.address.state='PA';expect(()=>calculatePAScheduleCNetIncome(input)).toThrow(/PA.*amortization.*source|amortization.*PA/i);expect(()=>calculatePAReturn(input)).toThrow(/PA.*amortization.*source|amortization.*PA/i);
});

it('preserves independent SE AGI QBI and federal tax originals',()=>{
 const july=scheduleCAmortizationFixture(),october=scheduleCAmortizationFixture();Object.assign(october.form4562!.amortizableAssets![0],{amortizableAmount:'3600',dateAmortizationBegins:'2025-10'});Object.assign(proof(october).rows[0],{acquisitionDate:'2025-01-15',businessStartDate:'2025-10-01',originalAsset:structuredClone(october.form4562!.amortizableAssets![0])});const both=scheduleCAmortizationFixture();both.form4562!.amortizableAssets!.push(structuredClone(october.form4562!.amortizableAssets![0]));proof(both).rows.push({...structuredClone(proof(october).rows[0]),assetIndex:1,sourceReference:'Actual separate October goodwill original',businessStartDate:'2025-01-01',acquisitionDate:'2025-10-15'});
 for(const [input,expected] of [[july,['5355','2678','35222','3894','15578','1631','6986']],[october,['5431','2716','35724','3995','15979','1679','7110']],[both,['5346','2673','35167','3883','15534','1625','6971']]] as const){const r=calculateFederalTax(input);expect([r.selfEmploymentTax,r.scheduleSE!.deductibleHalf,r.agi,r.form8995!.qbiDeduction,r.taxableIncome,r.ordinaryTax,r.totalTax].map(x=>x.toFixed())).toEqual(expected);}
});
it('preserves explicit zero and exact statutory month and rounding boundaries',()=>{
 for(const [basis,month,expected] of [['0','07','0'],['18000','01','1200'],['18000','12','100'],['18014','07','600'],['18015','07','601'],['18030','10','301'],['18014.99','07','600'],['18015.01','07','601']]){const input=scheduleCAmortizationFixture();Object.assign(input.form4562!.amortizableAssets![0],{amortizableAmount:basis,dateAmortizationBegins:`2025-${month}`});Object.assign(proof(input).rows[0],{acquisitionDate:`2025-${month}-15`,originalAsset:structuredClone(input.form4562!.amortizableAssets![0])});expect(calculateScheduleC(input,input.scheduleC).form4562!.line44.toFixed()).toBe(expected);}
 const input=scheduleCAmortizationFixture();(input.form4562!.amortizableAssets![0] as Record<string,unknown>).amortizationPeriodMonths=179;(proof(input).rows[0].originalAsset as Record<string,unknown>).amortizationPeriodMonths=179;expect(()=>calculateScheduleC(input,input.scheduleC)).toThrow(/197|statutory|source/i);
});

it('rejects conflicting business start records for one C activity',()=>{
 const input=scheduleCAmortizationFixture();const row=structuredClone(proof(input).rows[0]);Object.assign(row,{assetIndex:1,sourceReference:'Contradictory same-C start record',acquisitionDate:'2025-01-15',businessStartDate:'2025-10-01',originalAsset:{description:'Separate purchased customer goodwill',amortizableAmount:'3600',dateAmortizationBegins:'2025-10',codeSection:'197'}});proof(input).rows.push(row);input.form4562!.amortizableAssets!.push(structuredClone(row.originalAsset));expect(()=>calculateScheduleC(input,input.scheduleC)).toThrow(/business.*start|start.*business/i);
});

it('preserves actual monthly start originals and rejects impossible dates',()=>{
 const input=scheduleCAmortizationFixture();input.form4562!.amortizableAssets![0].dateAmortizationBegins='2025-07-01';proof(input).rows[0].originalAsset.dateAmortizationBegins='2025-07-01';expect(calculateScheduleC(input,input.scheduleC).form4562!.line44.toFixed()).toBe('600');
 for(const value of ['2025-07-99','2025-02-30','2025-13-01']){const invalid=scheduleCAmortizationFixture();invalid.form4562!.amortizableAssets![0].dateAmortizationBegins=value;proof(invalid).rows[0].originalAsset.dateAmortizationBegins=value;expect(()=>calculateScheduleC(invalid,invalid.scheduleC)).toThrow(/date|start|source|snapshot/i);}
});
