/** Spec: spec/federal/form-4562-passenger-first-year.yaml. */
import {expect,it} from 'vitest';
import {TaxYearInputSchema,Form4562Schema,type TaxYearInput} from '@/models/inputs.js';
import {calculateForm4562} from '@/engine/forms/form-4562.js';
import {calculateScheduleE} from '@/engine/schedules/schedule-e.js';
import {calculateScheduleCSourceFacts} from '@/engine/schedules/schedule-c-source-facts.js';
import {passengerFixture} from '../../fixtures/passenger-auto-first-year.js';
const simpleW2Fixture=TaxYearInputSchema.parse({taxpayer:{taxYear:2026,filingStatus:'single',primary:{firstName:'Fictional',lastName:'Fixture',ssn:'111-22-3333',dateOfBirth:'1990-01-01'},address:{street:'1 Fictional Way',city:'Fixture',state:'PA',zip:'19000'}}});
const cases=[['100000',75,'5000',false,'5000','0','4225','9225'],['20000',75,'1000',false,'1000','0','2800','3800'],['100000',75,'0',true,'0','15225','0','15225'],['100000',75,'5000',true,'5000','10225','0','15225'],['8000',75,'1000',true,'1000','5000','0','6000'],['100000',75,'9225',false,'9225','0','0','9225'],['14500',100,'0',false,'0','0','2900','2900']] as const;
it('computes the separate first-year passenger worksheet without duplicate deductions',()=>{
 for(const [gross,use,s,bonus,e179,eb,er,total] of cases){const input=Form4562Schema.parse(passengerFixture(gross,use,s,bonus)),before=JSON.stringify(input),r=calculateForm4562(input,2026),extra=r as unknown as Record<string,unknown>;
 expect([r.line12,r.line14,r.line21,r.line22].map(v=>v.toString())).toEqual([e179,'0',new Decimal(eb).plus(er).toString(),total]);
 expect(String(extra.line7)).toBe(e179);expect(String(extra.line25)).toBe(eb);expect(String(extra.line29)).toBe(e179);expect(String(extra.line28)).toBe(r.line21.toString());
 expect(JSON.stringify(input)).toBe(before);expect(JSON.stringify(r)).not.toContain('private-');expect(JSON.stringify(r)).not.toContain('1A2345678T1234567');expect(extra.passengerFirstYearWorksheet).toBeDefined();
 }
});
it('denies undocumented positive passenger summary compositions',()=>{for(const bonus of [false,true]){const input=passengerFixture('100000',75,'5000',bonus);const {passengerFirstYearSources:_unused,...legacy}=input;void _unused;expect(()=>calculateForm4562(Form4562Schema.parse(legacy),2026)).toThrow(/passenger|standalone/i);}});
it('denies canonical and direct parent consumption before any no-business or zero path',()=>{
 const form=passengerFixture(); const canonical={...simpleW2Fixture,taxpayer:{...simpleW2Fixture.taxpayer,taxYear:2026},scheduleC:undefined,form4562:form};
 expect(TaxYearInputSchema.safeParse(canonical).success).toBe(false);
 const rental={description:'Synthetic rental',propertyType:'single_family',rents:'0',depreciation:'0',form4562:form};
 expect(TaxYearInputSchema.safeParse({...canonical,form4562:undefined,rentalProperties:[rental]}).success).toBe(false);
 for(const packet of [form,{...form,passengerFirstYearSources:null},{...form,passengerFirstYearSources:{}}]){
 expect(()=>calculateScheduleCSourceFacts({...canonical,form4562:packet} as unknown as Parameters<typeof calculateScheduleCSourceFacts>[0],undefined)).toThrow(/passenger.*owner|passenger.*activity/i);
 expect(()=>calculateScheduleE({...canonical,form4562:undefined,rentalProperties:[{...rental,form4562:packet}]} as unknown as TaxYearInput)).toThrow(/passenger.*owner|passenger.*activity/i);
 }
});
it('validates fresh originals and all totals before short-circuiting179 at the cap',()=>{
 const a=passengerFixture('100000',75,'9225'),original=a.passengerFirstYearSources.originalForm.assets?.[0];if(!original)throw new Error('Synthetic fixture missing original');original.costBasis='1';expect(()=>calculateForm4562(Form4562Schema.parse(a),2026)).toThrow(/passenger/i);
});
import Decimal from 'decimal.js';
it('rounds computed whole-dollar deductions and annual caps without rounding source percentages',()=>{
 for(const [gross,use,s,bonus,expected] of [['100000',75.5,'5000',false,'9287'],['100000',50.5,'5000',false,'6212'],['100000',75.5,'5000',true,'15327'],['8000.66',75,'1000',true,'6000'],['8000.68',75,'1000',true,'6001'],['10002',75,'0',false,'1500'],['10003.34',75,'0',false,'1501']] as const){
 const input=passengerFixture(gross,use,s,bonus);expect(calculateForm4562(Form4562Schema.parse(input),2026).line22.toString()).toBe(expected);
 }
});
it('denies top-level typed ScheduleE packets even with no properties or other income',()=>{const i={...simpleW2Fixture,form4562:passengerFixture(),rentalProperties:[],scheduleK1:[],form1099Misc:[]};expect(()=>calculateScheduleE(i as unknown as TaxYearInput)).toThrow(/passenger.*owner|passenger.*activity/i);});
it('denies stale or mixed summaries without exposing private originals',()=>{
 const mutators:((v:ReturnType<typeof passengerFixture>)=>void)[]=[v=>{v.specialDepreciationAllowance='1';},v=>{v.section179ExpenseDeduction='4999';},v=>{v.taxYear=2025;},v=>{v.assets[0].businessUsePercentage=76;},v=>{v.assets[0].description='foreign-private-original';}];
 for(const mutate of mutators){const input=passengerFixture();mutate(input);const before=JSON.stringify(input);try{calculateForm4562(Form4562Schema.parse(input),2026);throw new Error('did not reject');}catch(error){expect(String(error)).toMatch(/passenger|year/i);expect(String(error)).not.toContain('private-');}expect(JSON.stringify(input)).toBe(before);}
});

it('preserves exact long original amounts and rejects contradictory mileage without changing global precision',()=>{
 const precision=Decimal.precision;
 const wrong=passengerFixture();wrong.passengerFirstYearSources.mileage.businessMiles='7500.0000000000000000000001';
 const before=JSON.stringify(wrong);expect(()=>calculateForm4562(Form4562Schema.parse(wrong),2026)).toThrow(/mileage/);expect(JSON.stringify(wrong)).toBe(before);
 expect(Decimal.precision).toBe(precision);
});
it('computes deductions from exact long original basis without premature rounding',()=>{
 const precision=Decimal.precision;const exact=passengerFixture('10002.499999999999999999999',100,'0');
 exact.assets[0].costBasis='10002.499999999999999999999';exact.passengerFirstYearSources.originalForm.assets=structuredClone(exact.assets);
 exact.section179TotalCost='10002.499999999999999999999';exact.passengerFirstYearSources.partI.totalCost=exact.section179TotalCost;exact.passengerFirstYearSources.originalForm.section179TotalCost=exact.section179TotalCost;
 const original=JSON.stringify(exact);expect(calculateForm4562(Form4562Schema.parse(exact),2026).line22.toString()).toBe('2000');expect(JSON.stringify(exact)).toBe(original);expect(Decimal.precision).toBe(precision);
 const rounded=passengerFixture('10002.499999999999999999999',100,'0');rounded.assets[0].costBasis='10002.5';rounded.passengerFirstYearSources.originalForm.assets=structuredClone(rounded.assets);rounded.section179TotalCost='10002.5';rounded.passengerFirstYearSources.partI.totalCost='10002.5';rounded.passengerFirstYearSources.originalForm.section179TotalCost='10002.5';const roundedOriginal=JSON.stringify(rounded);expect(()=>calculateForm4562(Form4562Schema.parse(rounded),2026)).toThrow(/basis disagree/);expect(JSON.stringify(rounded)).toBe(roundedOriginal);
});
it('rounds only the reported PartI income line and denies undocumented prior carryover',()=>{
 for(const [income,reported] of [['14999.49','14999'],['14999.50','15000']] as const){
 const input=passengerFixture();input.section179BusinessIncomeLimit=income;input.passengerFirstYearSources.partI.businessIncomeLimit=income;input.passengerFirstYearSources.originalForm.section179BusinessIncomeLimit=income;
 const before=JSON.stringify(input);expect(calculateForm4562(Form4562Schema.parse(input),2026).line11.toString()).toBe(reported);expect(JSON.stringify(input)).toBe(before);
 }
 const limited=passengerFixture('100000',75,'5000');limited.section179BusinessIncomeLimit='4999.50';limited.passengerFirstYearSources.partI.businessIncomeLimit='4999.50';limited.passengerFirstYearSources.originalForm.section179BusinessIncomeLimit='4999.50';expect(()=>calculateForm4562(Form4562Schema.parse(limited),2026)).toThrow(/PartI/);
});
it('denies undocumented positive passenger prior carryover without mutating originals',()=>{
 const v=passengerFixture();const {passengerFirstYearSources:_packet,section179ExpenseDeduction:_override,section179CarryoverToNextYear:_next,...legacy}=v;void _packet;void _override;void _next;
 const unsafe={...legacy,section179ElectedCost:'0',section179CarryoverFromPriorYear:'5000'},before=JSON.stringify(unsafe);expect(()=>calculateForm4562(Form4562Schema.parse(unsafe),2026)).toThrow(/passenger.*source/i);expect(JSON.stringify(unsafe)).toBe(before);
});

it('rounds only the reported PartI total cost while retaining exact documentary basis',()=>{
 for(const [gross,expected,raw] of [['10000.49','10000','10000.49'],['10000.50','10001','10000.5']] as const){
 const input=passengerFixture(gross,100,'0'),before=JSON.stringify(input),r=calculateForm4562(Form4562Schema.parse(input),2026);expect(r.line2.toString()).toBe(expected);expect(r.passengerFirstYearWorksheet?.['13'].toString()).toBe(raw);expect(JSON.stringify(input)).toBe(before);
 }
});
