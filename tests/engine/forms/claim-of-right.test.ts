// Spec: spec/federal/claim-of-right.yaml.
import { describe, expect, it } from 'vitest';
import { calculateFederalTax } from '@/engine/federal.js';
import Decimal from 'decimal.js';
import { calculateClaimOfRightSources, claimOfRightNetRefund } from '@/engine/forms/claim-of-right.js';
import { calculatePAReturn } from '@/engine/state/pa-orchestrator.js';
import { calculatePANonresidentReturn } from '@/engine/state/pa-nonresident-orchestrator.js';
import { buildOhioResidentReturnInput } from '@/engine/state/oh-input-adapter.js';
import { fillSchedule3, SCHEDULE_3_FIELDS as SCHEDULE_3 } from '@/pdf/fill-schedule-3.js';
import { fillScheduleA, SCHEDULE_A_FIELDS as SCHEDULE_A } from '@/pdf/fill-schedule-a.js';
import { TaxYearInputSchema } from '@/models/inputs.js';
import { simpleW2Fixture } from '../../fixtures/simple-w2.js';

const statement = (patch: Record<string, unknown>) => ({ payer: 'Synthetic state agency', payerTin: '12-3456789', accountHolder: 'primary', sourceId: 'g1', accountReference: 'statement-1',
  taxYear: 2025, sourceFormRevision: '2024-03', sourceFactsConfirmed: true, actualReceiptConfirmed: true, additionalWorksheetRequired: false, programType: 'government-unemployment',
  unemploymentCompensation: '0', federalWithheld: '0', stateOrLocalTaxRefund: '0', rtaaPayments: '0', taxableGrants: '0', agriculturePayments: '0', marketGain: '0', tradeOrBusinessRefund: false,
  currentYearRepaid: '0', unrecoveredAfterTaxContributions: '0', stateTaxReporting: 'none', stateWithheld: '0',
  priorYearRepaymentSource: { sourceReference: 'Fictional earlier return records', sourceFactsConfirmed: true, originalTaxYear: 2024, earlierReturnTax: '12000', refiguredEarlierTax: '10900', separateEarlierReturn: false }, ...patch });
const source = (repaid: string, patch: Record<string, unknown> = {}, itemized = true) => TaxYearInputSchema.parse({ ...simpleW2Fixture, w2s: [{ ...simpleW2Fixture.w2s[0], wages: '120000', federalWithheld: '30000' }],
  ...(itemized ? { scheduleA: { realEstateTaxes: '20000' } } : {}), form1099G: [statement({ priorYearRepaid: repaid, ...patch })] });
const earlier = (refiguredEarlierTax: string) => ({ priorYearRepaymentSource: { sourceReference: 'Fictional earlier return records', sourceFactsConfirmed: true, originalTaxYear: 2024, earlierReturnTax: '12000', refiguredEarlierTax, separateEarlierReturn: false } });

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

  it('tests the total repaid across statements and counts each earlier year once', () => {
    const second = statement({ sourceId: 'g2', accountReference: 'statement-2', priorYearRepaid: '2000' });
    const two = TaxYearInputSchema.parse({ ...source('2000'), form1099G: [statement({ priorYearRepaid: '2000' }), second] });
    const result = calculateFederalTax(two);
    expect([result.claimOfRight!.method, result.claimOfRight!.eligibleAmount.toFixed(), result.schedule3!.section1341Credit.toFixed()]).toEqual(['credit', '4000', '1100']);
    const conflict = TaxYearInputSchema.parse({ ...two, form1099G: [statement({ priorYearRepaid: '2000' }), { ...second, priorYearRepaymentSource: earlier('10000').priorYearRepaymentSource }] });
    expect(() => calculateFederalTax(conflict)).toThrow(/share the same/);
    expect(() => calculateFederalTax({ ...source('5000'), form8814: [{} as never] })).toThrow(/Form 8814 needs a separate method/);
    expect(() => calculateFederalTax({ ...source('3000'), stateReturns: { illinois: {} } } as never)).toThrow(/Illinois/);
  });

  it('groups repayment figures by earlier return', () => {
    const figures = (earlierReturnTax: string, refiguredEarlierTax: string) => ({ sourceReference: 'Fictional separate return', sourceFactsConfirmed: true, originalTaxYear: 2024, earlierReturnTax, refiguredEarlierTax, separateEarlierReturn: true });
    const spouse = { firstName: 'Sam', lastName: 'Doe', ssn: '111-22-3334', dateOfBirth: '1980-06-15', occupation: 'Consultant' };
    const separate = TaxYearInputSchema.parse({ ...source('2000'), taxpayer: { ...source('2000').taxpayer, filingStatus: 'married_filing_jointly', spouse },
      form1099G: [statement({ priorYearRepaid: '2000', priorYearRepaymentSource: figures('9000', '8500') }),
        statement({ sourceId: 'g2', accountReference: 'statement-2', accountHolder: 'spouse', priorYearRepaid: '2000', priorYearRepaymentSource: figures('7000', '6400') })] });
    expect(calculateClaimOfRightSources(separate)!.availableCredit.toFixed()).toBe('1100');
    const unanswered = source('5000'); Reflect.deleteProperty(unanswered.form1099G[0]!.priorYearRepaymentSource!, 'separateEarlierReturn');
    expect(() => calculateClaimOfRightSources(unanswered)).toThrow(/earlier filing answer/);
    const old = source('5000'); old.form1099G[0]!.priorYearRepaymentSource!.originalTaxYear = 1999;
    expect(() => calculateClaimOfRightSources(old)).toThrow(/earlier tax year/);
  });

  it('keeps a tie on the deduction and compares after all credits', () => {
    const first = calculateFederalTax(source('5000', earlier('11000'))), base = calculateFederalTax(source('3000'));
    const saving = base.totalTax.minus(first.totalTax).toFixed();
    const tie = calculateFederalTax(source('5000', earlier(String(12000 - Number(saving)))));
    expect([saving, tie.claimOfRight!.method]).toEqual(['1094', 'deduction']);
    expect(calculateFederalTax(source('5000', earlier(String(12000 - Number(saving) - 1)))).claimOfRight!.method).toBe('credit');
    expect(claimOfRightNetRefund({ refund: new Decimal(0), amountOwed: new Decimal(25) }).toFixed()).toBe('-25');
  });

  it('stops every state path and unsupported worksheet', () => {
    const input = source('5000'), result = calculateFederalTax(input);
    expect(() => calculatePANonresidentReturn(input)).toThrow(/earlier-year income.*Pennsylvania/);
    expect(() => buildOhioResidentReturnInput(input, result)).toThrow(/earlier-year income.*Ohio/);
    expect(() => calculateFederalTax({ ...input, form7206: { plans: [{ marketplaceCoverage: true }] } } as never)).toThrow(/Marketplace worksheets/);
    expect(() => calculateFederalTax({ ...input, form2210: { calculationMethod: 'annualized' } } as never)).toThrow(/Form 8814 needs a separate method/);
    expect(() => calculateFederalTax({ ...input, form2210: { returnPaidInFullDate: '2026-01-20' } } as never)).toThrow(/early-return payment date/);
  });

  it('prints the repayment on Schedule 3 and describes the deduction on Schedule A', async () => {
    const credit = source('5000'), creditResult = calculateFederalTax(credit);
    const schedule3 = (await fillSchedule3(credit, creditResult, 'forms/blank/2025/f1040s3.pdf')).getForm();
    expect([SCHEDULE_3.line13b, SCHEDULE_3.line14].map(name => schedule3.getTextField(name).getText())).toEqual(['1100', '1100']);
    const deduction = source('5000', earlier('11000')), deductionResult = calculateFederalTax(deduction);
    const scheduleA = (await fillScheduleA(deduction, deductionResult, 'forms/blank/2025/f1040sa.pdf')).getForm();
    expect(scheduleA.getTextField(SCHEDULE_A.line16Desc).getText()).toContain('Repaid income');
  });

  it('counts the repayment credit on Form 2210 line 3', () => {
    const line = (result: ReturnType<typeof calculateFederalTax>) => result.form2210!.lines.find(row => row.line === '3')!.value.toFixed();
    expect(line(calculateFederalTax(source('5000')))).toBe('1100');
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
    const none = calculateFederalTax(source('5000', earlier('12000'), false));
    expect(none.claimOfRight!.method).toBe('no_benefit');
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
