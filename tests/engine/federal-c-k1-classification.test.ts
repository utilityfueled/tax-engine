// Spec: spec/federal/k1-form461-classification.yaml#profitable-c-k1.
import {expect,it} from 'vitest';
import {calculateFederalTax} from '@/engine/federal.js';
import {cK1NecFixture,cK1OrdinaryFixture} from '../fixtures/c-k1-ordinary.js';
it('derives profitable C and K1 from actual sources without entered computed totals',()=>{
 const input=cK1OrdinaryFixture(),before=JSON.stringify(input),r=calculateFederalTax(input),f=r.form461!;
 expect([f.line2ScheduleC,f.line5ScheduleE,f.line8OtherBusiness,f.line9TotalIncomeLoss,f.line14NetBusinessAmount,f.line15Threshold,f.line16NetAfterThreshold,f.line16ExcessBusinessLoss].map(x=>x.toFixed())).toEqual(['40000','40000','-3362','76638','76638','626000','702638','0']);
 expect([r.agi,r.form8995!.qbiDeduction,r.taxableIncome,r.totalTax].map(x=>x.toFixed())).toEqual(['252738','15328','205910','41851']);
 expect(f.sourceFactsVerified).toBe(true);expect(f.requiresForm461).toBe(false);expect(input.form461).toBeUndefined();expect(JSON.stringify(input)).toBe(before);
});

it('reconciles actual linked NEC receipts once without changing ordinary C K1 tax',()=>{
 const input=cK1NecFixture(),before=JSON.stringify(input),r=calculateFederalTax(input);expect(r.form461!.line2ScheduleC.toFixed()).toBe('40000');expect(r.form461!.line14NetBusinessAmount.toFixed()).toBe('76638');expect(r.totalTax.toFixed()).toBe('41851');expect(r.agi.toFixed()).toBe('252738');expect(JSON.stringify(input)).toBe(before);
 const zeroOther=cK1NecFixture(),p=zeroOther.qbiLossSources!.form461Classification!.scheduleCSource!.necReceipts!;zeroOther.form1099Nec[0].nonemployeeCompensation='40000';p.rows![0].original={...zeroOther.form1099Nec[0]};p.otherGrossReceiptsNotOnNec='0';expect(calculateFederalTax(zeroOther).totalTax.toFixed()).toBe('41851');
 const returns=cK1NecFixture();delete returns.form2210;returns.scheduleC!.grossReceipts='41000';returns.scheduleC!.returnsAndAllowances='1000';returns.qbiLossSources!.form461Classification!.scheduleCSource!.necReceipts!.otherGrossReceiptsNotOnNec='15999.90';expect(calculateFederalTax(returns).form461!.line2ScheduleC.toFixed()).toBe('40000');
});
