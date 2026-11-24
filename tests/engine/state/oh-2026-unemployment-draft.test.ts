// Spec: state/oh-2026-return-draft.yaml#ordinary-unemployment-source.
import { describe, expect, it } from 'vitest';
import { calculateOhio2026OrdinarySource, calculateOhio2026UnemploymentEmployeeSource } from '@/engine/state/oh-2026-ordinary-source.js';
import { calculateOhio2026ReturnDraftFromSources } from '@/engine/state/oh-engine.js';
import { calculateOhio2026ReturnDraft, calculateOhio2026UnemploymentReturnDraft } from '@/engine/state/oh-2026-return-draft.js';
import { Form1099GSchema } from '@/models/inputs.js';
import { ohio2026OrdinaryFixture, rebindOhio2026Ordinary } from '../../fixtures/oh-2026-ordinary-return.js';

function current<T>(value: T | undefined): T {
  if (value === undefined) throw new Error('Complete fictional current sources required');
  return value;
}

function unemploymentFixture(status: 'part_year_resident' | 'nonresident' | 'full_year_resident' = 'part_year_resident') {
  const packet = ohio2026OrdinaryFixture(status, '50000', status === 'part_year_resident' ? '30000' : status === 'nonresident' ? '10000' : '50000');
  const form = Form1099GSchema.parse({
    payer: 'Fictional Ohio unemployment agency', accountHolder: 'primary', sourceId: 'PRIVATE-UC-2026',
    accountReference: 'PRIVATE-UC-ACCOUNT', taxYear: 2026, sourceFormRevision: '2026-12',
    programType: 'government-unemployment', sourceFactsConfirmed: true, actualReceiptConfirmed: true,
    additionalWorksheetRequired: false, unemploymentCompensation: '1000', stateOrLocalTaxRefund: '0',
    federalWithheld: '100', rtaaPayments: '0', taxableGrants: '0', agriculturePayments: '0', marketGain: '0',
    familyLeaveBenefits: '0', tradeOrBusinessRefund: false, currentYearRepaid: '0', priorYearRepaid: '0',
    unrecoveredAfterTaxContributions: '0', stateTaxReporting: 'none',
  });
  packet.input.form1099G = [form];
  const residency = current(packet.input.ohioResidency);
  const category = current(current(residency.owners[0]).amounts).unemployment;
  category.federalAmount = '1000';
  category.residentAmount = status === 'part_year_resident' ? '400' : status === 'full_year_resident' ? '1000' : '0';
  const schedule = {
    originalSourceId: 'PRIVATE-UC-2026', allPaymentsIncludedConfirmed: true as const,
    payments: [
      { sourceReference: 'PRIVATE-UC-PAY1', paidOrAccruedOn: '2026-06-30', amount: '600' },
      { sourceReference: 'PRIVATE-UC-PAY2', paidOrAccruedOn: '2026-07-01', amount: '400' },
    ],
  };
  residency.unemploymentPaymentSchedule = schedule;
  rebindOhio2026Ordinary(packet);
  const { firstName, lastName, ssn } = packet.input.taxpayer.primary;
  const sources = {
    ...packet.sources, methodId: 'oh-2026-unemployment-employee-draft-v1',
    unemploymentOriginal: {
      sourceId: schedule.originalSourceId, sourceReference: 'PRIVATE-ACTUAL-UC-ORIGINAL',
      recipient: { firstName, lastName, ssn }, currentUncorrectedNonvoidOriginalConfirmed: true,
      allOriginalBoxesKnownConfirmed: true, ordinaryNoncontributoryStateUnemploymentConfirmed: true,
      noStateWithholdingConfirmed: true,
    },
  };
  return { ...packet, sources, form, residency, category, schedule };
}

type Packet = ReturnType<typeof unemploymentFixture>;
function run(p: Packet) {
  return calculateOhio2026UnemploymentReturnDraft(p.input, p.sources);
}

describe('Ohio 2026 private ordinary Box 1 unemployment draft', () => {
  it('assigns gross Box 1 to Ohio only when domiciled there on the receipt date', () => {
    const packet = unemploymentFixture();
    const before = JSON.stringify(packet);
    const result = run(packet);
    expect(result.federalAgi.toFixed()).toBe('51000');
    expect(result.ohioAgi.toFixed()).toBe('51000');
    expect(result.nonresidentRatio.toFixed(4)).toBe('0.4039');
    expect(result.taxBeforeCredits.toFixed()).toBe('959');
    expect(result.nonresidentCredit.toFixed()).toBe('387');
    expect(result.incomeTax.toFixed()).toBe('572');
    expect(result.withholding.toFixed()).toBe('1000');
    expect(result.refund.toFixed()).toBe('428');
    expect(result.lines.find(line => line.line === '12' && line.description === 'Resident unemployment')?.value.toFixed()).toBe('400');
    expect(result).toMatchObject({ ruleVersion: packet.sources.methodId, calculationStatus: 'incomplete', reviewStatus: 'independent-review-pending', filingQualified: false });
    expect(JSON.stringify(packet)).toBe(before);
  });

  it('uses zero Ohio unemployment for a full-year nonresident paid by an Ohio agency', () => {
    const result = run(unemploymentFixture('nonresident'));
    expect(result.federalAgi.toFixed()).toBe('51000');
    expect(result.nonresidentRatio.toFixed(4)).toBe('0.8039');
    expect(result.nonresidentCredit.toFixed()).toBe('771');
    expect(result.refund.toFixed()).toBe('812');
    expect(result.lines.find(line => line.line === '12' && line.description === 'Resident unemployment')?.value.toFixed()).toBe('0');
  });

  it('admits one fully documented actual payment instead of a schedule', () => {
    const packet = unemploymentFixture();
    delete packet.residency.unemploymentPaymentSchedule;
    packet.residency.unemploymentPaymentSource = {
      originalSourceId: packet.schedule.originalSourceId, allPaymentsIncludedConfirmed: true,
      sourceReference: 'PRIVATE-UC-ONLY-PAYMENT', paidOrAccruedOn: '2026-07-01', amount: '1000',
    };
    packet.category.residentAmount = '1000';
    expect(run(packet).nonresidentRatio.toFixed(4)).toBe('0.3921');
  });

  it.each<[string, (p: Packet) => void, RegExp]>([
    ['missing receipt proof', p => { delete p.residency.unemploymentPaymentSchedule; }, /one complete Box 1 receipt proof/],
    ['conflicting receipt proofs', p => { p.residency.unemploymentPaymentSource = {
      originalSourceId: p.schedule.originalSourceId, allPaymentsIncludedConfirmed: true,
      sourceReference: 'PRIVATE-UC-ONLY-PAYMENT', paidOrAccruedOn: '2026-07-01', amount: '1000',
    }; }, /one complete Box 1 receipt proof/],
    ['wrong Box 1 link', p => { p.schedule.originalSourceId = 'PRIVATE-OTHER-ACCOUNT'; }, /one complete Box 1 receipt proof/],
    ['duplicate receipt', p => { current(p.schedule.payments[1]).sourceReference = current(p.schedule.payments[0]).sourceReference; }, /distinct original receipt references/],
    ['invalid calendar date', p => { current(p.schedule.payments[0]).paidOrAccruedOn = '2026-06-31'; }, /actual payment dates/],
    ['receipt from another year', p => { current(p.schedule.payments[0]).paidOrAccruedOn = '2025-06-30'; }, /actual payment dates/],
    ['fractional receipt', p => { current(p.schedule.payments[0]).amount = '599.25'; }, /positive whole-dollar amounts/],
    ['Box 1 total mismatch', p => { current(p.schedule.payments[0]).amount = '599'; }, /reconcile to Form 1099-G Box 1/],
    ['false resident allocation', p => { p.category.residentAmount = '1000'; }, /actual source categories and service allocation differ/],
    ['nonresident assignment from an Ohio payer', p => { p.category.nonresidentOhioAmount = '600'; }, /actual source categories and service allocation differ/],
    ['foreign owner', p => { p.form.accountHolder = 'spouse'; }, /one confirmed current government unemployment original/],
    ['earlier form revision', p => { p.form.sourceFormRevision = '2024-03'; }, /one confirmed current government unemployment original/],
    ['earlier source year', p => { p.form.taxYear = 2025; }, /one confirmed current government unemployment original/],
    ['unconfirmed actual income', p => { p.form.actualReceiptConfirmed = false; }, /one confirmed current government unemployment original/],
    ['unresolved original fields', p => { p.form.sourceFactsComplete = false; }, /one confirmed current government unemployment original/],
    ['family leave', p => { p.form.familyLeaveBenefits = '1'; }, /separate Box 1 unemployment method/],
    ['unemployment repayments', p => { p.form.priorYearRepaid = '1'; }, /separate Box 1 unemployment method/],
    ['unrecovered contributions', p => { p.form.unrecoveredAfterTaxContributions = '1'; }, /separate Box 1 unemployment method/],
    ['unqualified state withholding', p => { p.form.stateWithheld = '10'; }, /separate Box 1 unemployment method/],
    ['unconfirmed withholding outside the form', p => { p.sources.unemploymentOriginal.noStateWithholdingConfirmed = false; }, /complete confirmed current source packets/],
    ['different person named as the actual recipient', p => { p.sources.unemploymentOriginal.recipient.ssn = '900-70-0911'; }, /actual original unemployment recipient and reference differ/],
    ['original source reference links to a different form', p => { p.sources.unemploymentOriginal.sourceId = 'PRIVATE-DIFFERENT-FORM'; }, /actual original unemployment recipient and reference differ/],
    ['unsupported tax refund basis', p => { p.form.refundTaxYear = 2025; }, /one confirmed current government unemployment original/],
    ['multiple 1099-G originals', p => { current(p.input.form1099G).push(structuredClone(p.form)); }, /one confirmed current government unemployment original/],
  ])('holds %s', (_description, mutate, match) => {
    const packet = unemploymentFixture();
    mutate(packet);
    rebindOhio2026Ordinary(packet);
    expect(() => run(packet)).toThrow(match);
  });

  it('keeps full-year Ohio residence and the existing wage-only entry point outside the method', () => {
    expect(() => run(unemploymentFixture('full_year_resident'))).toThrow(/single part-year or nonresident owner/);
    const { input, sources } = unemploymentFixture();
    const { methodId: _method, unemploymentOriginal: _original, ...ordinarySources } = sources;
    expect(() => calculateOhio2026OrdinarySource(input, ordinarySources)).toThrow(/retained other originals/);
    expect(() => calculateOhio2026ReturnDraftFromSources({ taxInput: input, sources })).toThrow(/complete confirmed current source packets/);
  });

  it('rejects modified receipt evidence and forged contexts before composing a return', () => {
    const p = unemploymentFixture();
    const context = calculateOhio2026UnemploymentEmployeeSource(p.input, p.sources);
    expect(() => calculateOhio2026ReturnDraft(p.input, p.sources, { ...context })).toThrow(/stale or forged/);
    current(p.schedule.payments[0]).paidOrAccruedOn = '2026-06-29';
    expect(() => calculateOhio2026ReturnDraft(p.input, p.sources, context)).toThrow(/stale or forged/);
  });
});
