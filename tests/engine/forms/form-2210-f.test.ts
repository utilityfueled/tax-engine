// Spec: spec/federal/form-2210-f.yaml.
import { describe, expect, it } from 'vitest';
import Decimal from 'decimal.js';
import { calculateForm2210, type Form2210Input } from '@/engine/forms/form-2210.js';
import { FORM_2210_FIELDS as F, fillForm2210 } from '@/pdf/mappings/2025/fill-form-2210.js';
import type { TaxReturnResult } from '@/models/outputs.js';
import type { TaxYearInput } from '@/models/inputs.js';
import { PDFDocument } from 'pdf-lib';
import { simpleW2Fixture } from '../../fixtures/simple-w2.js';

const facts = { calendarYearTaxpayer: true, residentReturn: true, disasterReliefClaimed: false, waiverRequested: false, farmerOrFisher: true, farmingIncomeTwoThirdsConfirmed: true,
  calculationMethod: 'regular' as const, withholdingMethod: 'equal-installments' as const, priorYearTaxStatus: 'return-filed' as const, priorYearFullYear: true, priorYearTaxComputationConfirmed: true,
  priorYearTaxForForm2210: '18000', priorYearAgiForForm2210: '100000', priorYearResidentAllYear: true, priorYearJointReturn: false };
const run = (patch: Partial<Form2210Input> = {}, factPatch = {}, late?: { date: string; amount: string }[]) => calculateForm2210({ taxYear: 2025, currentYearTax: new Decimal(30000), incomeTaxAfterCredits: new Decimal(30000), withholding: new Decimal(5000),
  estimatedPayments: new Decimal(8000), refundableCredits: new Decimal(0), filingStatus: 'single',
  payments: [{ date: '2026-01-15', amount: '8000', kind: 'estimated' }, ...(late ?? []).map(row => ({ ...row, kind: 'return' as const }))], facts: { ...facts, ...factPatch }, ...patch });
const line = (result: ReturnType<typeof run>, name: string) => result.lines.find(row => row.line === name)?.value.toFixed();

describe('Form 2210-F', () => {
  it('figures the required payment and underpayment', () => {
    expect(line(run({ refundableCredits: new Decimal(3000) }), '9')).toBe('22000');
    expect(line(run({ refundableCredits: new Decimal(3000) }), '7')).toBe('18009');
    expect(line(run({ currentYearTax: new Decimal(30001) }), '7')).toBe('20011');
    const extension = run({ payments: [{ date: '2026-01-15', amount: '8000', kind: 'estimated' }, { date: '2026-01-10', amount: '1000', kind: 'extension' }] });
    expect(line(extension, '12')).toBe('14000');
    const result = run();
    expect(['7', '11', '12', '13'].map(name => line(result, name))).toEqual(['20010', '18000', '13000', '5000']);
    expect(line(run({}, { priorYearTaxStatus: 'no-return' }), '13')).toBe('7010');
    expect(line(run({}, { priorYearFullYear: false }), '11')).toBe('20010');
    expect(line(run({}, { priorYearTaxForForm2210: '25000' }), '11')).toBe('20010');
  });

  it('matches and reports exact 2026 farmer payment sources through January 15', () => {
    const payments: Form2210Input['payments'] = [
      { date: '2026-04-15', amount: '1000000000000000000', kind: 'prior-year-credit' },
      { date: '2026-06-15', amount: '0.01', kind: 'prior-year-credit' },
      { date: '2026-09-15', amount: '0', kind: 'prior-year-credit' },
      { date: '2027-01-15', amount: '0.02', kind: 'estimated' },
      { date: '2027-01-16', amount: '10.99', kind: 'return' },
    ];
    const runWith = (total: string) => run({ taxYear: 2026, estimatedPayments: new Decimal(total), withholding: new Decimal('0.04'), payments });
    expect.soft(() => runWith('1000000000000000000')).toThrow(/dated estimated and prior-credit payments must reconcile/u);
    const result = runWith('1000000000000000000.03');
    expect(line(result, '12')).toBe('1000000000000000000.07');
    expect(result.totalPayments.toFixed()).toBe('1000000000000000000.07');
    expect(result.penalty.isZero()).toBe(true);
  });

  it('counts days from January 15 to payment or April 15', () => {
    const paid = run({}, {}, [{ date: '2026-03-20', amount: '5000' }]);
    expect([line(paid, '15'), paid.exactPenalty.toDecimalPlaces(2).toFixed(), paid.penalty.toFixed()]).toEqual(['64', '61.37', '61']);
    const open = run();
    expect([line(open, '15'), open.exactPenalty.toDecimalPlaces(2).toFixed(), open.penalty.toFixed()]).toEqual(['90', '86.3', '86']);
    expect(run({}, {}, [{ date: '2026-05-01', amount: '5000' }]).penalty.toFixed()).toBe('86');
  });

  it('applies each exception on both sides', () => {
    expect(run({ currentYearTax: new Decimal(999), withholding: new Decimal(0), estimatedPayments: new Decimal(0), payments: [] }).penalty.toFixed()).toBe('0');
    expect(run({ withholding: new Decimal(29001), estimatedPayments: new Decimal(0), payments: [] }).safeHarborReason).toMatch(/less than/);
    const atThousand = run({ currentYearTax: new Decimal(1000), withholding: new Decimal(0), estimatedPayments: new Decimal(0), payments: [] }, { priorYearTaxForForm2210: '5000' });
    expect([atThousand.safeHarborMet, line(atThousand, '13')]).toEqual([false, '667']);
    expect(run({ withholding: new Decimal(18000), estimatedPayments: new Decimal(0), payments: [] }).safeHarborReason).toMatch(/Withholding/);
    const early = { returnFiledDate: '2026-03-02', returnPaidInFullDate: '2026-03-02' }, paidUp = [{ date: '2026-03-02', amount: '17000' }];
    expect(run({}, early, paidUp).penalty.toFixed()).toBe('0');
    expect(run({}, { ...early, returnPaidInFullDate: '2026-03-03' }, [{ date: '2026-03-03', amount: '17000' }]).penalty.toFixed()).toBe('45');
    expect(() => run({}, early)).toThrow(/does not reconcile to actual payments/);
    expect(() => run({}, early, [{ date: '2026-03-03', amount: '17000' }])).toThrow(/does not reconcile to actual payments/);
    expect(run({ refundableCredits: new Decimal(5000) }, early, [{ date: '2026-03-02', amount: '12000' }]).penalty.toFixed()).toBe('0');
    expect(() => run({ refundableCredits: new Decimal(5000) }, early, [{ date: '2026-03-02', amount: '11999.99' }])).toThrow(/does not reconcile to actual payments/);
    // The return rounds, so a whole-dollar payment of a rounded-down balance is full payment.
    expect(run({ currentYearTax: new Decimal('30000.40') }, early, [{ date: '2026-03-02', amount: '17000' }]).penalty.toFixed()).toBe('0');
    expect(() => run({ currentYearTax: new Decimal('30000.49') }, early, [{ date: '2026-03-02', amount: '16999.50' }])).toThrow(/does not reconcile to actual payments/);
    expect(() => run({ currentYearTax: new Decimal('30000.50') }, early, [{ date: '2026-03-02', amount: '17000.49' }])).toThrow(/does not reconcile to actual payments/);
    expect(() => run({}, { returnFiledDate: '2026-03-02' })).toThrow(/both returnFiledDate/);
    expect(() => run({}, { returnFiledDate: '2025-03-01', returnPaidInFullDate: '2025-03-01' })).toThrow(/must follow the tax year/);
    const nonresident = run({ withholding: new Decimal(0), estimatedPayments: new Decimal(0), payments: [] }, { priorYearTaxStatus: 'no-tax-liability', priorYearTaxForForm2210: '0', priorYearResidentAllYear: false });
    expect([line(nonresident, '11'), nonresident.penalty.toFixed()]).toEqual(['20010', '345']);
    expect(run({}, { priorYearTaxStatus: 'no-tax-liability', priorYearTaxForForm2210: '0' }).penalty.toFixed()).toBe('0');
    expect(run({ estimatedPayments: new Decimal(13000), payments: [{ date: '2026-01-15', amount: '13000', kind: 'estimated' }] }).safeHarborReason).toMatch(/January 15/);
  });

  it('rejects unknown farmer facts and unsupported payments', () => {
    expect(() => run({}, { farmingIncomeTwoThirdsConfirmed: undefined })).toThrow(/two-thirds/);
    expect(() => run({}, { calculationMethod: 'annualized' })).toThrow(/no annualized/);
    expect(() => run({}, {}, [{ date: '2026-02-01', amount: '1000' }, { date: '2026-03-01', amount: '4000' }])).toThrow(/one payment date/);
    for (const [patch, message] of [[{ disasterReliefClaimed: true }, /disasterReliefClaimed scenario/], [{ calendarYearTaxpayer: false }, /calendarYearTaxpayer scenario/], [{ residentReturn: false }, /residentReturn scenario/],
      [{ disasterReliefClaimed: undefined }, /requires disasterReliefClaimed/], [{ waiverRequested: undefined }, /requires waiverRequested/], [{ withholdingMethod: undefined }, /requires withholdingMethod/],
      [{ priorYearTaxStatus: undefined }, /requires priorYearTaxStatus/], [{ priorYearFullYear: undefined }, /requires priorYearFullYear/], [{ priorYearTaxComputationConfirmed: undefined }, /requires priorYearTaxComputationConfirmed/]] as const) {
      expect(() => run({}, patch), JSON.stringify(patch)).toThrow(message);
    }
    expect(() => run({}, { priorYearTaxStatus: 'no-tax-liability', priorYearResidentAllYear: undefined, priorYearTaxForForm2210: '0' })).toThrow(/requires priorYearResidentAllYear/);
    expect(() => run({}, { priorYearTaxStatus: 'no-tax-liability', priorYearTaxForForm2210: '1' })).toThrow(/conflicts with priorYearTaxForForm2210/);
    expect(() => run({ incomeTaxAfterCredits: undefined })).toThrow(/incomeTaxAfterCredits/);
    expect(() => run({ payments: [{ date: '2020-01-15', amount: '8000', kind: 'estimated' }] })).toThrow(/outside the tax-year/);
    expect(() => run({ payments: [{ date: '2027-01-01', amount: '8000', kind: 'estimated' }] })).toThrow(/outside the tax-year/);
    expect(() => run({ estimatedPayments: new Decimal(9000) })).toThrow(/reconcile to estimatedPayments/);
  });

  it('records waiver requests without treating them as granted', () => {
    const waiver = { waiverRequested: true, waiverReason: 'retirement_or_disability', waiverStatementReference: 'Fictional statement' };
    const partial = run({}, { ...waiver, waiverKind: 'partial', waiverAmount: '30' });
    expect([partial.penalty.toFixed(), partial.waiver!.penaltyBeforeWaiver.toFixed(), partial.requiresForm2210]).toEqual(['56', '86', true]);
    expect(run({}, { ...waiver, waiverKind: 'full' }).penalty.toFixed()).toBe('0');
    expect(() => run({}, { ...waiver, waiverKind: 'partial', waiverAmount: '87' })).toThrow(/no more than the penalty/);
    expect(() => run({}, { ...waiver, waiverKind: 'partial', waiverAmount: '' })).toThrow(/kind and amount/);
    expect(() => run({}, { ...waiver, waiverKind: 'full', waiverReason: undefined })).toThrow(/reason and statement/);
    expect(() => run({}, { ...waiver, waiverKind: 'full', waiverStatementReference: ' ' })).toThrow(/reason and statement/);
    expect(() => run({}, { ...waiver, waiverKind: 'partial', waiverAmount: '0' })).toThrow(/positive/);
    expect(run({}, { ...waiver, waiverKind: 'partial', waiverAmount: '86' }).penalty.toFixed()).toBe('0');
    expect(run({}, { ...waiver, waiverKind: 'partial', waiverAmount: '30.25' }).penalty.toFixed()).toBe('56');
  });

  it('applies the 2027 rate after the 2026 farmer filing exception', () => {
    const timelyEstimate = { date: '2027-01-15', amount: '8000', kind: 'estimated' as const };
    const paidOn = (date: string) => [{ ...timelyEstimate }, { date, amount: '17000', kind: 'return' as const }];
    const result = (date: string) => run({ taxYear: 2026, payments: paidOn(date) }, { returnFiledDate: date, returnPaidInFullDate: date });
    expect(result('2027-03-01').penalty.toFixed()).toBe('0');
    const late = result('2027-03-02');
    // $5,000 × 46 days × 0.08 ÷ 365. April 15 caps accrual at 90 days.
    expect([line(late, '15'), late.exactPenalty.toFixed(8), late.penalty.toFixed()]).toEqual(['46', '50.41095890', '50']);
    expect(late.lines.find(row => row.line === '16')?.inputs).toEqual({
      annualRate: new Decimal('0.08'), rateSource: 'https://www.irs.gov/pub/irs-drop/rr-26-25.pdf',
    });
    const afterCutoff = result('2027-04-16');
    expect([line(afterCutoff, '15'), afterCutoff.exactPenalty.toFixed(8), afterCutoff.penalty.toFixed()]).toEqual(['90', '98.63013699', '99']);
    const changed = run({ filingStatus: 'married_filing_jointly' }, { priorYearJointReturn: false });
    expect(changed.requiresForm2210).toBe(true);
    expect(run({ filingStatus: 'married_filing_jointly' }, { priorYearJointReturn: false, priorYearTaxForForm2210: '25000' }).requiresForm2210).toBe(false);
  });

  it('marks waiver boxes on Form 2210 and has no Form 2210-F map', async () => {
    const regular = { ...facts, farmerOrFisher: false, priorYearTaxStatus: 'no-return' as const };
    const waiver = { ...regular, waiverRequested: true, waiverReason: 'casualty_disaster_or_unusual_circumstance' as const, waiverStatementReference: 'Fictional statement' };
    const render = async (form2210: typeof waiver & { waiverKind: 'full' | 'partial'; waiverAmount?: string }) => {
      const result = calculateForm2210({ taxYear: 2025, currentYearTax: new Decimal(30000), incomeTaxAfterCredits: new Decimal(30000), withholding: new Decimal(0), estimatedPayments: new Decimal(0), refundableCredits: new Decimal(0), filingStatus: 'single', payments: [], facts: form2210 });
      const doc = await fillForm2210({ ...simpleW2Fixture, form2210 } as TaxYearInput, { taxYear: 2025, form2210: result } as TaxReturnResult, 'forms/blank/2025/f2210.pdf');
      return (await PDFDocument.load(await doc.save())).getForm();
    };
    const full = await render({ ...waiver, waiverKind: 'full' });
    expect([full.getCheckBox(F.boxA).isChecked(), full.getCheckBox(F.boxB).isChecked()]).toEqual([true, false]);
    const partial = await render({ ...waiver, waiverKind: 'partial', waiverAmount: '100' });
    expect([partial.getCheckBox(F.boxA).isChecked(), partial.getCheckBox(F.boxB).isChecked()]).toEqual([false, true]);
    await expect(fillForm2210({ ...simpleW2Fixture, form2210: facts } as TaxYearInput, { taxYear: 2025, form2210: run() } as TaxReturnResult, 'forms/blank/2025/f2210.pdf')).rejects.toThrow(/no review map/);
  });
});
