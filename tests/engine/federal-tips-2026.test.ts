// Spec: spec/federal/form-8960.yaml, form-1099-oid.yaml, schedule-a.yaml.
import { describe, expect, it, vi } from 'vitest';
vi.mock('@/models/constants.js',async importOriginal=>{
 const original=await importOriginal<typeof import('@/models/constants.js')>();
 const {FEDERAL_2026_CONSTANTS}=await import('@/models/federal-2026-indexed.js');
 return {...original,getConstants:(year:number)=>year===2026?FEDERAL_2026_CONSTANTS:original.getConstants(year)};
});
import { calculateFederalTax } from '@/engine/federal.js';
import { TaxYearInputSchema } from '@/models/inputs.js';
import { simpleW2Fixture } from '../fixtures/simple-w2.js';
describe('Actual TIPS2026 return routing',()=>{
 it('limits the TIPS NIIT deduction to actual post-section68 itemized deductions',()=>{
  const input=TaxYearInputSchema.parse({...simpleW2Fixture,taxpayer:{...simpleW2Fixture.taxpayer,taxYear:2026},
   w2s:[{...simpleW2Fixture.w2s[0],wages:'1000000',federalWithheld:'500000',socialSecurityTips:'0'}],
   form1099Int:[{payer:'Actual other interest',interestIncome:'30000'}],
   form1099OID:[{payer:'Actual synthetic Treasury',sourceId:'tips',taxYear:2026,sourceFormRevision:'2024-01',sourceFactsConfirmed:true,recipientAmountsConfirmed:true,obligationType:'treasury',inflationIndexed:true,description:'TIPS',originalIssueDiscount:'0',otherPeriodicInterest:'0',earlyWithdrawalPenalty:'0',federalWithheld:'0',marketDiscount:'0',acquisitionPremium:'0',treasuryOID:'-20000',investmentExpenses:'0',bondPremium:'0',taxExemptOID:'0',stateWithholding:[],oidReportedNetOfAcquisitionPremium:false,interestReportedNetOfBondPremium:false,marketDiscountElection:false,bondPremiumElection:false,modernBondPremiumRulesApply:true,tipsDeflationFacts:{allInstrumentInterestReportedHere:true,priorInterestInclusions:'20000',priorOrdinaryLosses:'0',priorCarryforward:'0'}}]});
  const result=calculateFederalTax(input);
  // 2/37 x20000=1081 rounded; only18919 itemized deduction is actually allowed.
  expect(result.itemizedDeductionReduction.toString()).toBe('1081');
  expect(result.deductionUsed).toBe('itemized');
  expect(result.scheduleA?.oidOrdinaryLossDeduction.toString()).toBe('20000');
  expect(result.form8960.additionalModifications.toString()).toBe('18919');
  expect(result.form8960.netInvestmentIncome.toString()).toBe('11081');
  expect(result.form8960.niitTax.toString()).toBe('421');
 });
});
