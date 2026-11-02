// Spec: spec/federal/k1-form461-classification.yaml#profitable-c-k1.
import {expect,it} from 'vitest';
import {calculateFederalTax} from '@/engine/federal.js';
import {cK1OrdinaryFixture} from '../fixtures/c-k1-ordinary.js';
it('derives profitable C and K1 from actual sources without entered computed totals',()=>{
 const input=cK1OrdinaryFixture(),before=JSON.stringify(input),r=calculateFederalTax(input),f=r.form461!;
 expect([f.line2ScheduleC,f.line5ScheduleE,f.line8OtherBusiness,f.line9TotalIncomeLoss,f.line14NetBusinessAmount,f.line15Threshold,f.line16NetAfterThreshold,f.line16ExcessBusinessLoss].map(x=>x.toFixed())).toEqual(['40000','40000','-3362','76638','76638','626000','702638','0']);
 expect([r.agi,r.form8995!.qbiDeduction,r.taxableIncome,r.totalTax].map(x=>x.toFixed())).toEqual(['252738','15328','205910','41851']);
 expect(f.sourceFactsVerified).toBe(true);expect(f.requiresForm461).toBe(false);expect(input.form461).toBeUndefined();expect(JSON.stringify(input)).toBe(before);
});
