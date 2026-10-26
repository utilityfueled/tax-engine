// Spec: spec/federal/form-1099-q-annual-cash.yaml canonical.
import { expect, it } from 'vitest';
import { calculateFederalTax } from '@/engine/federal.js';
import { TaxYearInputSchema } from '@/models/inputs.js';
import { educatorInKindFixture } from '../fixtures/educator-in-kind.js';
import { annualCashQtpFixture, annualCashReportingFixture } from '../fixtures/education-annual-cash.js';
it('carries the actual annual cash earnings through the return once', () => {
  const { input } = annualCashQtpFixture(), before = JSON.stringify(input), parsed = TaxYearInputSchema.parse(input);
  const result = calculateFederalTax(parsed);
  expect([result.agi, result.form1099Q?.taxableEarnings, result.form1099Q?.netPenalty].map(v => v?.toFixed())).toEqual(['53500', '3500', '350']);
  expect(result.allLines.filter(line => line.form === 'Sched 1' && line.line === '8z').map(line => line.value.toFixed())).toEqual(['3500']);
  expect(result.form1099Q?.perDistribution.map(row => row.educationExpenseExcludedEarnings.toFixed())).toEqual(['1200', '300']);
  expect(JSON.stringify(input)).toBe(before);
  const withEducator = structuredClone(input); withEducator.adjustments = educatorInKindFixture(2025).adjustments;
  const educator = withEducator.adjustments?.educatorExpenseSources?.[0], paid = educator?.expenses[0];
  if (!educator || !paid) throw new Error('Missing fictional actual educator expense');
  paid.amount = '1800'; educator.nontaxableQualifiedTuitionProgramAmount = '1500'; educator.nontaxableCoverdellEarnings = '0';
  const coordinated = calculateFederalTax(withEducator);
  expect(coordinated.schedule1?.educatorExpenses.toFixed()).toBe('300');
  expect(coordinated.agi.toFixed()).toBe('53200');
  educator.nontaxableQualifiedTuitionProgramAmount = '1499';
  expect(() => calculateFederalTax(withEducator)).toThrow(/educator|reconcil/i);

});

it('propagates annual summed cents to canonical income and additional tax',()=>{
  const {input}=annualCashReportingFixture('4.50','95.50'),before=JSON.stringify(input);
  const result=calculateFederalTax(TaxYearInputSchema.parse(input));
  expect([result.agi,result.form1099Q?.taxableEarnings,result.form1099Q?.netPenalty].map(v=>v?.toFixed())).toEqual(['50005','5','1']);
  expect(result.allLines.find(line=>line.form==='Sched 1'&&line.line==='8z')?.value.toFixed()).toBe('5');
  expect(result.form1099Q?.perDistribution.map(row=>row.taxableEarnings.toFixed())).toEqual(['2.25','2.25']);
  expect(JSON.stringify(input)).toBe(before);
  input.adjustments=educatorInKindFixture(2025).adjustments;
  const source=input.adjustments?.educatorExpenseSources?.[0],expense=source?.expenses[0];
  if(!source||!expense)throw new Error('Missing fictional actual educator source');
  source.nontaxableQualifiedTuitionProgramAmount='4.50';source.nontaxableCoverdellEarnings='0';expense.amount='304.50';
  const adjusted=calculateFederalTax(input);
  expect([adjusted.schedule1?.educatorExpenses,adjusted.agi].map(v=>v?.toFixed())).toEqual(['300','49705']);
  source.nontaxableQualifiedTuitionProgramAmount='5';
  expect(()=>calculateFederalTax(input)).toThrow(/educator|reconcil/i);
});
