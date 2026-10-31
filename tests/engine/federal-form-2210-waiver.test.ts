// Spec: spec/federal/form-2210-f.yaml return-flow.
import { expect, it } from 'vitest';
import { calculateFederalTax } from '@/engine/federal.js';
import { TaxYearInputSchema } from '@/models/inputs.js';
import { assessReturnReadiness } from '@/utils/return-readiness.js';
import { simpleW2Fixture } from '../fixtures/simple-w2.js';

const facts = { calendarYearTaxpayer: true, residentReturn: true, farmerOrFisher: false, disasterReliefClaimed: false, waiverRequested: false, withholdingMethod: 'equal-installments', priorYearTaxStatus: 'no-return', calculationMethod: 'regular' };
const waiver = { waiverRequested: true, waiverReason: 'retirement_or_disability', waiverStatementReference: 'Fictional statement' };
const input = (patch = {}) => TaxYearInputSchema.parse({ ...simpleW2Fixture, w2s: [{ ...simpleW2Fixture.w2s[0], federalWithheld: '0' }], form2210: { ...facts, ...patch } });

it('carries a waiver request through Form 1040 without treating it as granted', () => {
  const base = calculateFederalTax(input()), penalty = base.estimatedTaxPenalty;
  expect(penalty.gt(100)).toBe(true);
  const partial = calculateFederalTax(input({ ...waiver, waiverKind: 'partial', waiverAmount: '100' }));
  expect(partial.estimatedTaxPenalty.toFixed()).toBe(penalty.minus(100).toFixed());
  expect(partial.amountOwed.toFixed()).toBe(base.amountOwed.minus(100).toFixed());
  expect(partial.form2210!.waiver!.penaltyBeforeWaiver.toFixed()).toBe(penalty.toFixed());
  expect(partial.form2210!.requiresForm2210).toBe(true);
  const full = calculateFederalTax(input({ ...waiver, waiverKind: 'full' }));
  expect(full.estimatedTaxPenalty.toFixed()).toBe('0');
  expect(full.form2210!.waiver!.requestedAmount.toFixed()).toBe(penalty.toFixed());
  const readiness = assessReturnReadiness({ taxInput: input({ ...waiver, waiverKind: 'full' }), federalResult: full, includedForms: [], stateCode: null });
  expect(readiness.packetCompleteness).toBe('partial');
  expect(readiness.findings.join(' ')).toContain('Form 2210 is still suppressed');
});
