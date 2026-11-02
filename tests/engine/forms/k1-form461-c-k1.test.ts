// Spec: spec/federal/k1-form461-classification.yaml#profitable-c-k1-proof.
import {expect,it} from 'vitest';
import {calculateK1Form461Classification} from '@/engine/forms/k1-form461-classification.js';
import {calculateScheduleE} from '@/engine/schedules/schedule-e.js';
import {FEDERAL_2026_CONSTANTS} from '@/models/federal-2026-indexed.js';
import {d} from '@/utils/decimal.js';
import {TaxYearInputSchema} from '@/models/inputs.js';
import {calculateFederalTax} from '@/engine/federal.js';
import {cK1OrdinaryFixture} from '../../fixtures/c-k1-ordinary.js';
it('requires actual C proof and preserves K1-only and loss boundaries',()=>{
 const baseline=cK1OrdinaryFixture();
 for(const patch of [{businessNameStatus:undefined},{businessEINStatus:undefined},{businessNameStatus:'blank_original' as const},{businessEINStatus:'not_issued' as const},{sourceTaxYear:2024},{sourceReference:''},{sourceFactsConfirmed:undefined},{sourceFactsConfirmed:false},{accountHolder:'spouse' as const},{businessName:'Other'},{businessEIN:'98-7654321'},{recipientName:'Other'},{recipientTaxpayerIdLast4:'9999'},{allIncomeDomesticConfirmed:undefined},{allIncomeDomesticConfirmed:false},{ordinaryBusinessOnlyConfirmed:false}]){
  const input=structuredClone(baseline);Object.assign(input.qbiLossSources!.form461Classification!.scheduleCSource!,patch);expect(()=>calculateFederalTax(input)).toThrow(/classification|source|ordinary|ScheduleC|proof/i);
 }
 for(const mutate of [(i:typeof baseline)=>{delete i.qbiLossSources!.form461Classification!.scheduleCSource;},(i:typeof baseline)=>{i.qbiLossSources!.form461Classification!.method='ordinary_k1_only';},(i:typeof baseline)=>{i.scheduleC!.grossReceipts='-1';},(i:typeof baseline)=>{i.scheduleK1[0].ordinaryIncome='-1';i.qbiLossSources!.activities![0].statement!.ordinaryIncome='-1';}]){const input=structuredClone(baseline);mutate(input);expect(()=>calculateFederalTax(input)).toThrow();}
 const changed=structuredClone(baseline);changed.scheduleC!.grossReceipts='50000';delete changed.form2210;const r=calculateFederalTax(changed);expect(r.form461!.line2ScheduleC.toFixed()).toBe('50000');
});

it('accepts an explicitly known blank sole proprietor name and no EIN without inventing identifiers',()=>{
 const input=cK1OrdinaryFixture(),proof=input.qbiLossSources!.form461Classification!.scheduleCSource!;
 delete input.scheduleC!.businessName;delete input.scheduleC!.ein;Object.assign(proof,{businessNameStatus:'blank_original',businessEINStatus:'not_issued'});delete proof.businessName;delete proof.businessEIN;
 const before=JSON.stringify(input),r=calculateFederalTax(input);expect(r.form461!.line2ScheduleC.toFixed()).toBe('40000');expect(r.totalTax.toFixed()).toBe('41851');expect(JSON.stringify(input)).toBe(before);
 const contradiction=structuredClone(input);contradiction.scheduleC!.ein='12-1111111';expect(()=>calculateFederalTax(contradiction)).toThrow(/source|identity|classification|ScheduleC/i);
});

it('calculates isolated 2026 sources while preserving the full return readiness gate',()=>{
 const original=cK1OrdinaryFixture();
 const retax=(value:unknown,key=''):unknown=>Array.isArray(value)?value.map(item=>retax(item)):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).map(([k,v])=>[k,retax(v,k)])):(key==='sourceTaxYear'||key==='taxYear')&&typeof value==='number'?value+1:value;
 const raw=retax(original) as typeof original;raw.taxpayer.taxYear=2026;delete raw.form2210;const input=TaxYearInputSchema.parse(raw);
 const r=calculateK1Form461Classification(input,{scheduleE:calculateScheduleE(input),scheduleCNetProfit:d('40000'),capitalGainOrLoss:d(0),deductibleSETax:d('3883'),seHealthInsurance:d(0),seRetirementContributions:d(0)},FEDERAL_2026_CONSTANTS)!;
 expect([r.form461.line14NetBusinessAmount,r.form461.line15Threshold,r.form461.line16NetAfterThreshold,r.form461.line16ExcessBusinessLoss].map(x=>x.toFixed())).toEqual(['76117','512000','588117','0']);
 expect(()=>calculateFederalTax(input)).toThrow(/2026|complete|verified|ready|readiness|gate/i);
});

it('rejects unlinked nonzero NEC while preserving explicit zero sources',()=>{
 const source={taxYear:2025,payer:'Different actual business payer',accountHolder:'primary' as const,nonemployeeCompensation:'100000',federalWithheld:'0',stateWithheld:'0'};
 const input=cK1OrdinaryFixture();input.form1099Nec=[source];expect(()=>calculateFederalTax(input)).toThrow(/source|business|classification|ordinary/i);
 const zero=cK1OrdinaryFixture();zero.form1099Nec=[{...source,nonemployeeCompensation:'0'}];expect(calculateFederalTax(zero).totalTax.toFixed()).toBe('41851');
});
