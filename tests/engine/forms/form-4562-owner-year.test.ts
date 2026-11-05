import {describe,expect,it} from 'vitest';
import type {z} from 'zod';
import {calculateForm4562} from '@/engine/forms/form-4562.js';
import {calculateScheduleC} from '@/engine/schedules/schedule-c.js';
import {calculateScheduleE} from '@/engine/schedules/schedule-e.js';
import {buildForm4562ReferenceSummary} from '@/pdf/mappings/2025/fill-form-4562.js';
import {Form4562Schema,TaxYearInputSchema,type Form4562Input,type TaxYearInput} from '@/models/inputs.js';

// Exercise actual canonical parsing before the exported calculator.
const calculate=(raw:z.input<typeof Form4562Schema>,year?:number)=>calculateForm4562(Form4562Schema.parse(raw),year);

// spec/federal/form-4562-owner-year.yaml. Oracles: statutory published limits;
// 12000/180*6=400 in2025, then12000/180*12=800 in2026.
const amortization:Form4562Input=Form4562Schema.parse({amortizableAssets:[{description:'Synthetic patent',amortizableAmount:'12000',dateAmortizationBegins:'2025-07-01',codeSection:'197'}]});
const owner=(year:2025|2026,form:Form4562Input):TaxYearInput=>TaxYearInputSchema.parse({taxpayer:{taxYear:year,filingStatus:'single',primary:{firstName:'Synthetic',lastName:'Owner',ssn:'900-70-0001',dateOfBirth:'1990-01-15'},address:{street:'1 Test Street',city:'Test City',state:'WA',zip:'98101'},dependents:[]},scheduleC:{businessName:'Synthetic activity',grossReceipts:'10000'},form4562:form,rentalProperties:[{description:'Synthetic rental',propertyType:'single_family',personalUseDays:0,rentalDays:365,isActiveParticipant:true,qualifiesForQBI:false,qbiIsSST:false,rents:'10000',form4562:form}]});

describe('Form4562 actual owner year',()=>{
  it('uses independently published indexed defaults and exact threshold cents',()=>{
    for(const [year,maximum,threshold] of [[2025,'2500000','4000000'],[2026,'2560000','4090000']] as const){
      const exact=calculate({taxYear:year,section179TotalCost:threshold,section179ElectedCost:'3000000',section179BusinessIncomeLimit:'3000000'});
      expect([exact.line1.toString(),exact.line3.toString(),exact.line12.toString()]).toEqual([maximum,threshold,maximum]);
      const over=calculate({taxYear:year,section179TotalCost:year===2025?'4000000.01':'4090000.01',section179ElectedCost:'3000000',section179BusinessIncomeLimit:'3000000'});
      expect(over.line4.toString()).toBe('0.01');
      expect(over.line12.toString()).toBe(year===2025?'2499999.99':'2559999.99');
    }
    for(const year of [2024,2027,2026.5,NaN,Infinity])expect(()=>calculate({taxYear:year})).toThrow(/year/i);
    expect(calculate({}).line1.toString()).toBe('2500000');
  });
  it('rejects conflicting owner years without changing historical input',()=>{
    const original={...amortization,taxYear:2025};const before=JSON.stringify(original);
    expect(()=>calculate(original,2026)).toThrow(/year/i);
    expect(JSON.stringify(original)).toBe(before);
    expect(calculate(amortization,2026).line44.toString()).toBe('800');
    expect(calculate(original,2025).line44.toString()).toBe('400');
  });
  it('binds business and rental amortization to the actual owner year',()=>{
    // Ordinary equipment requires no amortization attribution method. Its
    // second-year HY200DB deduction is10000*.32=3200, not first-year2000.
    const equipment=Form4562Schema.parse({assets:[{costBasis:'10000',placedInServiceDate:'2025-01',recoveryPeriod:'5'}]});
    const input=owner(2026,equipment),before=JSON.stringify(input);
    const business=calculateScheduleC(input,input.scheduleC),rental=calculateScheduleE(input);
    expect(business.lines.find(l=>l.form==='Form 4562'&&l.line==='17')?.value.toString()).toBe('3200');
    expect(rental.lines.find(l=>l.form==='Form 4562'&&l.line==='17')?.value.toString()).toBe('3200');
    const rentalAmortization={...input,form4562:undefined,scheduleC:undefined,rentalProperties:owner(2026,amortization).rentalProperties};
    expect(calculateScheduleE(rentalAmortization).lines.find(l=>l.form==='Form 4562'&&l.line==='44')?.value.toString()).toBe('800');
    expect(JSON.stringify(input)).toBe(before);
    const conflict=owner(2026,{...amortization,taxYear:2025});
    expect(()=>calculateScheduleC(conflict,conflict.scheduleC)).toThrow(/year/i);
    expect(()=>calculateScheduleE(conflict)).toThrow(/year/i);
  });
  it('rejects mismatched reference activities before rendering',()=>{
    const conflict=owner(2025,{...amortization,taxYear:2026});
    expect(()=>buildForm4562ReferenceSummary(conflict)).toThrow(/year/i);
    const rentalOnly={...conflict,scheduleC:undefined,form4562:undefined};
    expect(()=>buildForm4562ReferenceSummary(rentalOnly)).toThrow(/year/i);
    expect(buildForm4562ReferenceSummary(owner(2025,amortization)).activities.map(a=>a.amortizationBridgeValue)).toEqual(['400','400']);
  });
  it('reports the actual statutory and carryover years in the audit',()=>{
    for(const year of [2025,2026]){
      const lines=calculate({},year).lines;
      expect(lines.find(l=>l.line==='1')?.formula).toBe(`${year} statutory section 179 maximum deduction`);
      expect(lines.find(l=>l.line==='3')?.formula).toBe(`${year} statutory section 179 threshold cost`);
      expect(lines.find(l=>l.line==='10')?.description).toContain(`from ${year-1}`);
      expect(lines.find(l=>l.line==='13')?.description).toContain(`to ${year+1}`);
    }
  });
  it('preserves absent and explicit zero overrides through actual canonical parsing',()=>{
    const keys=['section179MaximumDeduction','section179ThresholdCost','section179ExpenseDeduction','section179CarryoverToNextYear'] as const;
    for(const year of [2025,2026]){
      const input=Form4562Schema.parse({taxYear:year,section179TotalCost:year===2025?'4000000':'4090000',section179ElectedCost:'3000000',section179BusinessIncomeLimit:'3000000'});
      for(const key of keys)expect(input[key]).toBeUndefined();
      const result=calculate(input);
      expect([result.line1.toString(),result.line3.toString(),result.line12.toString(),result.line13.toString()]).toEqual(year===2025?['2500000','4000000','2500000','0']:['2560000','4090000','2560000','0']);
      expect(calculate(Form4562Schema.parse(JSON.parse(JSON.stringify(input))))).toEqual(result);
      const zero=Form4562Schema.parse({...input,...Object.fromEntries(keys.map(key=>[key,'0']))});
      for(const key of keys)expect(zero[key]).toBe('0');
      const zeroResult=calculate(zero);
      expect([zeroResult.line1.toString(),zeroResult.line3.toString(),zeroResult.line12.toString(),zeroResult.line13.toString()]).toEqual(['0','0','0','0']);
    }
  });
});
