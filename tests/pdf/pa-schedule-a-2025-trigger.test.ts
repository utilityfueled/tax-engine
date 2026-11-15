/** Spec: spec/state/pa-schedule-a.yaml#pa-schedule-a-2025-adjustment-only-trigger */
import Decimal from 'decimal.js';
import {describe,it,expect} from 'vitest';
import {calculatePAScheduleA} from '@/engine/state/pa-schedule-a.js';
import {calculateFederalTax} from '@/engine/federal.js';
import {calculatePAReturn} from '@/engine/state/pa-orchestrator.js';
import {TaxYearInputSchema} from '@/models/inputs.js';
import {assessReturnReadiness} from '@/utils/return-readiness.js';
import {simpleW2Fixture} from '../fixtures/simple-w2.js';
import {shouldIncludePAScheduleAReferenceSummary,buildPAScheduleAReferenceSummary} from '@/pdf/fill-pa-schedule-a.js';

describe('final2025 adjustment-only attachment rule',()=>{
 it.each(['0','2500','2501','3000','999999'])('ordinary interest %s alone does not require ScheduleA',value=>{
  const result=calculatePAScheduleA({taxYear:2025,federalInterestIncome:new Decimal(value)});
  expect(shouldIncludePAScheduleAReferenceSummary(result)).toBe(false);
 });
 it.each(['line2','line3','line5','line6','line7','line8','line11','line12','line13','line14','line15'] as const)('actual adjustment %s requires ScheduleA even below2500',line=>{
  const result=calculatePAScheduleA({taxYear:2025,federalInterestIncome:new Decimal(100)});
  result[line]=new Decimal(1);
  expect(shouldIncludePAScheduleAReferenceSummary(result)).toBe(true);
 });
 it('suppresses nonresident ScheduleA and preserves resident and part-year adjustment attachments',()=>{
  const result=calculatePAScheduleA({taxYear:2025,federalInterestIncome:new Decimal(3000),reductionAdjustments:[{description:'Non-residency period interest',amount:new Decimal(3000)}]});
  expect(shouldIncludePAScheduleAReferenceSummary(result,'nonresident')).toBe(false);
  expect(shouldIncludePAScheduleAReferenceSummary(result,'resident')).toBe(true);
  expect(shouldIncludePAScheduleAReferenceSummary(result,'part_year')).toBe(true);
 });
 it('does not claim an unnecessary attachment is missing for ordinary3000 interest',()=>{
  const input=TaxYearInputSchema.parse({...simpleW2Fixture,taxpayer:{...simpleW2Fixture.taxpayer,address:{...simpleW2Fixture.taxpayer.address,state:'PA'}},form1099Int:[{payer:'Keystone Bank',interestIncome:'3000'}]});
  const result={...calculateFederalTax(input),stateReturns:{pennsylvania:calculatePAReturn(input)}};
  const assessment=assessReturnReadiness({taxInput:input,federalResult:result,includedForms:['f1040-filled.pdf','pa-40-filled.pdf'],stateCode:'PA'});
  expect(assessment.findings.some(finding=>finding.includes('Schedule A'))).toBe(false);
  expect(assessment.filingQualified).toBe(false);
 });
 it('discloses the actual adjustment-only filing trigger',()=>{
  const result=calculatePAScheduleA({taxYear:2025,federalInterestIncome:new Decimal(3000)});
  expect(buildPAScheduleAReferenceSummary(result).filingTrigger).not.toContain('2,500');
 });
});
