// Spec: spec/federal/taxable-state-refund-recoveries.yaml.
import{it,expect,vi}from'vitest';
vi.mock('@/models/constants.js',async original=>{const real=await original<typeof import('@/models/constants.js')>();const{FEDERAL_2026_CONSTANTS}=await import('@/models/federal-2026-indexed.js');return{...real,getConstants:(year:number)=>year===2026?FEDERAL_2026_CONSTANTS:real.getConstants(year)};});
import{calculateFederalTax}from'@/engine/federal.js';
import{calculateStateLocalIncomeTaxDeduction}from'@/engine/forms/state-local-income-tax-deduction.js';
import{getRulePack}from'@/models/rule-pack-metadata.js';
import{refundInput,multiOriginRefundInput}from'../fixtures/taxable-state-refund-recoveries.js';
it('transfers300 toSchedule1 and reduces actual current payments1000 to900 once',()=>{
 const input=refundInput(),original=structuredClone(input),result=calculateFederalTax(input);expect(result.schedule1?.taxableRefunds.toFixed()).toBe('300');expect(result.agi.toFixed()).toBe('50300');expect(calculateStateLocalIncomeTaxDeduction(input).currentYearRefunds.toFixed()).toBe('100');expect(calculateStateLocalIncomeTaxDeduction(input).total.toFixed()).toBe('900');expect(result.form1099G?.refundSources.reduce((sum,x)=>sum.plus(x.amount),result.agi.times(0)).toFixed()).toBe('400');expect(input).toEqual(original);
});
it('transfers different historical years once without opening the2026 public gate',()=>{
 const input=multiOriginRefundInput(),original=structuredClone(input),result=calculateFederalTax(input);expect(result.schedule1?.taxableRefunds.toFixed()).toBe('900');expect(result.agi.toFixed()).toBe('50900');expect(getRulePack(2026).calculationStatus).toBe('incomplete');expect(getRulePack(2026).filingQualified).toBe(false);expect(input).toEqual(original);
});
import {refundSource,refundPayment} from '../fixtures/taxable-state-refund-recoveries.js';
it('keeps an entirely same-year recovery out of income and preserves actual public constants denial',async()=>{
 const input=refundInput(2025,[refundSource(2025,'current','400',[refundPayment('actual January payment','2025-01-15','1000',{collection:'estimatedTaxPayments',index:0})])],[]);
 const result=calculateFederalTax(input);expect(result.schedule1?.taxableRefunds.toFixed()).toBe('0');expect(result.agi.toFixed()).toBe('50000');expect(calculateStateLocalIncomeTaxDeduction(input).total.toFixed()).toBe('600');expect(result.taxableStateRefundRecoveries?.years).toEqual([]);
 const originalConstants=await vi.importActual<typeof import('@/models/constants.js')>('@/models/constants.js');expect(()=>originalConstants.getConstants(2026)).toThrow();
});
