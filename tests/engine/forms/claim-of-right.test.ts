// Spec: spec/federal/claim-of-right.yaml.
import { describe, expect, it } from 'vitest';
import { calculateFederalTax } from '@/engine/federal.js';
import { calculatePAReturn } from '@/engine/state/pa-orchestrator.js';
import { TaxYearInputSchema } from '@/models/inputs.js';
import { simpleW2Fixture } from '../../fixtures/simple-w2.js';

const statement = (patch: Record<string, unknown>) => ({ payer: 'Synthetic state agency', payerTin: '12-3456789', accountHolder: 'primary', sourceId: 'g1', accountReference: 'statement-1',
  taxYear: 2025, sourceFormRevision: '2024-03', sourceFactsConfirmed: true, actualReceiptConfirmed: true, additionalWorksheetRequired: false, programType: 'government-unemployment',
  unemploymentCompensation: '0', federalWithheld: '0', stateOrLocalTaxRefund: '0', rtaaPayments: '0', taxableGrants: '0', agriculturePayments: '0', marketGain: '0', tradeOrBusinessRefund: false,
  currentYearRepaid: '0', unrecoveredAfterTaxContributions: '0', stateTaxReporting: 'none', stateWithheld: '0',
  priorYearRepaymentSource: { sourceReference: 'Fictional earlier return records', sourceFactsConfirmed: true, originalTaxYear: 2024, earlierReturnTax: '12000', refiguredEarlierTax: '10900' }, ...patch });
const source = (repaid: string, patch: Record<string, unknown> = {}, itemized = true) => TaxYearInputSchema.parse({ ...simpleW2Fixture, w2s: [{ ...simpleW2Fixture.w2s[0], wages: '120000', federalWithheld: '30000' }],
  ...(itemized ? { scheduleA: { realEstateTaxes: '20000' } } : {}), form1099G: [statement({ priorYearRepaid: repaid, ...patch })] });
const earlier = (refiguredEarlierTax: string) => ({ priorYearRepaymentSource: { sourceReference: 'Fictional earlier return records', sourceFactsConfirmed: true, originalTaxYear: 2024, earlierReturnTax: '12000', refiguredEarlierTax } });

describe('Repaid earlier-year income', () => {
  it('tests both sides of the three thousand dollar threshold', () => {
    const none = calculateFederalTax(source('3000')), base = calculateFederalTax({ ...source('3000'), form1099G: [] });
    expect(none.claimOfRight).toMatchObject({ method: 'not_deductible' });
    expect(none.claimOfRight!.nondeductibleAmount.toFixed()).toBe('3000');
    expect([none.totalTax.toFixed(), none.schedule3!.section1341Credit.toFixed()]).toEqual([base.totalTax.toFixed(), '0']);
    const over = calculateFederalTax(source('3000.01'));
    expect(over.claimOfRight!.eligibleAmount.toFixed()).toBe('3000.01');
    expect(over.claimOfRight!.method).not.toBe('not_deductible');
  });

  it('chooses the method that gives less tax', () => {
    const credit = calculateFederalTax(source('5000'));
    expect(credit.claimOfRight!.method).toBe('credit');
    expect([credit.totalTax.toFixed(), credit.schedule3!.section1341Credit.toFixed(), credit.scheduleA!.otherItemizedDeductions.toFixed()]).toEqual(['16914', '1100', '0']);
    expect(credit.schedule3!.totalRefundableCredits.toFixed()).toBe('1100');
    const deduction = calculateFederalTax(source('5000', earlier('11000')));
    expect(deduction.claimOfRight!.method).toBe('deduction');
    expect([deduction.totalTax.toFixed(), deduction.schedule3!.section1341Credit.toFixed(), deduction.scheduleA!.otherItemizedDeductions.toFixed()]).toEqual(['15820', '0', '5000']);
    const nonitemizer = calculateFederalTax(source('5000', earlier('11999'), false));
    expect([nonitemizer.claimOfRight!.method, nonitemizer.schedule3!.section1341Credit.toFixed()]).toEqual(['credit', '1']);
    const tie = calculateFederalTax(source('5000', earlier('12000'), false));
    expect(tie.claimOfRight!.method).toBe('deduction');
  });

  it('rejects missing or conflicting earlier return facts', () => {
    for (const [patch, message] of [
      [{ priorYearRepaymentSource: undefined }, /earlier-return records/],
      [{ priorYearRepaymentSource: { ...earlier('1').priorYearRepaymentSource, sourceFactsConfirmed: false } }, /confirmed earlier-return/],
      [{ priorYearRepaymentSource: { ...earlier('1').priorYearRepaymentSource, sourceReference: ' ' } }, /confirmed earlier-return/],
      [{ priorYearRepaymentSource: { ...earlier('1').priorYearRepaymentSource, originalTaxYear: 2025 } }, /earlier tax year/],
      [{ priorYearRepaymentSource: { ...earlier('1').priorYearRepaymentSource, earlierReturnTax: '' } }, /tax shown/],
      [{ priorYearRepaymentSource: { ...earlier('1').priorYearRepaymentSource, refiguredEarlierTax: '-1' } }, /refigured earlier tax/],
      [{ priorYearRepaymentSource: { ...earlier('1').priorYearRepaymentSource, refiguredEarlierTax: '12001' } }, /cannot increase/],
    ] as const) expect(() => calculateFederalTax(source('5000', patch)), JSON.stringify(patch)).toThrow(message);
    expect(() => calculatePAReturn(source('5000'))).toThrow(/earlier-year income.*Pennsylvania/);
  });
});
