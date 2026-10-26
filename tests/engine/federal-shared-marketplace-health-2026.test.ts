// Spec: spec/federal/shared-marketplace-health.yaml. Isolated indexed-method control; production2026 remains closed.
import { expect,it,vi } from 'vitest';
vi.mock('@/models/constants.js',async importOriginal=>{
  const original=await importOriginal<typeof import('@/models/constants.js')>();
  const {FEDERAL_2026_CONSTANTS}=await import('@/models/federal-2026-indexed.js');
  return {...original,getConstants:(year:number)=>year===2026?FEDERAL_2026_CONSTANTS:original.getConstants(year)};
});
import {calculateFederalTax} from '@/engine/federal.js';
import {sharedMarketplaceHealthInput} from '../fixtures/shared-marketplace-health.js';
it('preserves2026 allocated family calculation and full original sources',()=>{
  const input=sharedMarketplaceHealthInput(2026);
  // Actual changing January premium requires the same monthly reporting method
  // in both independent source controls; unchanged unshared sources use annual rounding.
  input.form1095A[0].monthlyPremiums[0].enrolleePremium='1000.02';
  input.form8962!.sharedPolicyAllocations!.policies![0].original=structuredClone(input.form1095A[0]);
  input.form8962!.monthlyReconciliation![0].enrolleePremium='500.01';
  const january=input.form7206!.plans![0].payments![0];january.grossPremium='1000.02';january.ownerOrBusinessPaid=january.personAmounts![0].amountPaid='200.01';january.otherPersonPaid='200.01';
  const before=structuredClone(input),control=structuredClone(input);
  control.form8962!.allocationRequired=false;delete control.form8962!.sharedPolicyAllocations;
  control.form7206!.persons=control.form7206!.persons!.slice(0,1);
  const plan=control.form7206!.plans![0];delete plan.sharedMarketplaceSources;plan.allCoveredPersonsInCoverageFamilyConfirmed=true;plan.coveredPersons=plan.coveredPersons!.slice(0,1);
  control.form1095A[0].coveredIndividuals=control.form1095A[0].coveredIndividuals!.slice(0,1);
  for(const row of control.form1095A[0].monthlyPremiums){row.enrolleePremium='500';row.slcsp='700';row.advancePremiumTaxCredit='300';}
  for(const paid of plan.payments!){paid.grossPremium='500';paid.otherPersonPaid='0';paid.advancePremiumTaxCredit='300';paid.personAmounts=paid.personAmounts!.slice(0,1);}
  control.form1095A[0].monthlyPremiums[0].enrolleePremium='500.01';plan.payments![0].grossPremium='500.01';
  const actual=calculateFederalTax(input),own=calculateFederalTax(control);
  expect(actual.form8962!.calculationMethod).toBe('monthly');expect(own.form8962!.calculationMethod).toBe('monthly');
  expect([actual.schedule1!.seHealthInsurance.toFixed(),actual.agi.toFixed(),actual.form8962!.ptcAllowed.toFixed()]).toEqual([own.schedule1!.seHealthInsurance.toFixed(),own.agi.toFixed(),own.form8962!.ptcAllowed.toFixed()]);
  expect(actual.form7206!.grossSourcePremiums.toFixed()).toBe('12000.02');expect(own.form7206!.grossSourcePremiums.toFixed()).toBe('6000.01');expect(input).toEqual(before);
});
