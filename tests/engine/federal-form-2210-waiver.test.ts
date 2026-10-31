// Spec: spec/federal/form-2210-f.yaml return-flow.
import { expect, it } from 'vitest';
import Decimal from 'decimal.js';
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

it('tests a claimed full payment against total tax due', () => {
  const dates = { returnFiledDate: '2026-01-20', returnPaidInFullDate: '2026-01-20' };
  const excise = { form5329: { traditionalIRACurrentYearExcessContributions: '1000', traditionalIRAValueDec31: '1000' } };
  const withExcise = (facts = {}) => TaxYearInputSchema.parse({ ...input(facts), ...excise });
  const before = calculateFederalTax(input()).totalTax, due = calculateFederalTax(withExcise()).totalTax;
  expect(due.minus(before).toFixed()).toBe('60');
  const paid = (amount: string, date = '2026-01-20') => withExcise({ ...dates, returnPayments: [{ date, amount }] });
  expect(() => calculateFederalTax(paid(due.toFixed()))).not.toThrow();
  expect(() => calculateFederalTax(paid(due.minus('0.49').toFixed()))).not.toThrow();
  expect(() => calculateFederalTax(withExcise({ ...dates, returnPayments: [{ date: '2026-01-20', amount: before.toFixed() }, { date: '2026-01-21', amount: '60' }] }))).toThrow(/reconcile to total tax due/);
  const withheld = (amount: string) => TaxYearInputSchema.parse({ ...paid(amount), w2s: [{ ...simpleW2Fixture.w2s[0], federalWithheld: '1000' }] });
  expect(() => calculateFederalTax(withheld(due.minus(1000).toFixed()))).not.toThrow();
  expect(() => calculateFederalTax(withheld(due.minus(1002).toFixed()))).toThrow(/total tax due/);
  expect(() => calculateFederalTax(paid(before.toFixed()))).toThrow(/reconcile to total tax due/);
  expect(() => calculateFederalTax(paid(due.toFixed(), '2026-01-21'))).toThrow(/actual payments|total tax due/);
});

it('rounds a regular partial waiver and tests it against the final penalty', () => {
  const base = calculateFederalTax(input());
  expect(calculateFederalTax(input({ ...waiver, waiverKind: 'partial', waiverAmount: '100.25' })).estimatedTaxPenalty.toFixed()).toBe(base.estimatedTaxPenalty.minus(100).toFixed());
  const household = (facts = {}, wages = '100000') => TaxYearInputSchema.parse({ ...input(facts), w2s: [{ ...simpleW2Fixture.w2s[0], wages, federalWithheld: '0', socialSecurityWages: wages, medicareWages: wages, socialSecurityWithheld: new Decimal(wages).times('0.062').toFixed(), medicareWithheld: new Decimal(wages).times('0.0145').toFixed() }],
    scheduleH: { employees: [{ name: 'Nanny', cashWages: '20000', isSpouse: false, isChildUnder21: false, isParent: false, isUnder18NonPrincipal: false }], futaApplies: true, futaSectionA: true } });
  const final = calculateFederalTax(household()).estimatedTaxPenalty, withoutHousehold = calculateFederalTax(TaxYearInputSchema.parse({ ...household(), scheduleH: undefined })).estimatedTaxPenalty;
  expect(final.gt(withoutHousehold)).toBe(true);
  expect(calculateFederalTax(household({ ...waiver, waiverKind: 'partial', waiverAmount: final.toFixed() })).estimatedTaxPenalty.toFixed()).toBe('0');
  expect(() => calculateFederalTax(household({ ...waiver, waiverKind: 'partial', waiverAmount: final.plus(1).toFixed() }))).toThrow(/no more than the penalty/);
  // A household return below the payment threshold still keeps its waiver request.
  expect(calculateFederalTax(household({ ...waiver, waiverKind: 'full' }, '10000')).form2210!.waiver?.kind).toBe('full');
});

it('names the farmer form in readiness findings', () => {
  const farmer = { farmerOrFisher: true, farmingIncomeTwoThirdsConfirmed: true, priorYearTaxForForm2210: '999999', priorYearTaxStatus: 'return-filed', priorYearFullYear: true, priorYearResidentAllYear: true, priorYearJointReturn: false, priorYearTaxComputationConfirmed: true };
  const source = input(farmer), result = calculateFederalTax(source);
  const form = result.estimatedTaxPenalty.gt(0) || result.form2210!.requiresForm2210;
  const readiness = assessReturnReadiness({ taxInput: source, federalResult: result, includedForms: [], stateCode: null });
  if (form) expect(readiness.findings.join(' ')).toContain('Form 2210-F');
  const noPenalty = assessReturnReadiness({ taxInput: input(), federalResult: { ...calculateFederalTax(input()), estimatedTaxPenalty: new Decimal(0), form2210: { ...calculateFederalTax(input()).form2210!, requiresForm2210: false, waiver: undefined } }, includedForms: [], stateCode: null });
  expect(noPenalty.findings.join(' ')).not.toContain('2210');
  const required = assessReturnReadiness({ taxInput: input(), federalResult: { ...calculateFederalTax(input()), estimatedTaxPenalty: new Decimal(0), form2210: { ...calculateFederalTax(input()).form2210!, requiresForm2210: true, waiver: undefined } }, includedForms: [], stateCode: null });
  expect(required.packetCompleteness).toBe('partial');
});
