// Spec: spec/federal/schedule-c-wagering-2026.yaml
import { expect, it, vi } from 'vitest';
vi.mock('@/models/constants.js', async importOriginal => {
  const real = await importOriginal<typeof import('@/models/constants.js')>();
  const { FEDERAL_2026_CONSTANTS } = await import('@/models/federal-2026-indexed.js');
  return { ...real, getConstants: (year: number) => year === 2026 ? FEDERAL_2026_CONSTANTS : real.getConstants(year) };
});
import { calculateFederalTax } from '@/engine/federal.js';
import { calculateScheduleC } from '@/engine/schedules/schedule-c.js';
import { buildOhioResidentReturnInput } from '@/engine/state/oh-input-adapter.js';
import { calculatePAScheduleCNetIncome } from '@/engine/state/pa-orchestrator.js';
import { TaxYearInputSchema } from '@/models/inputs.js';
import { simpleW2Fixture } from '../fixtures/simple-w2.js';
import { fictionalEmptyEicHistory } from '../fixtures/eic-disallowance.js';

function source() {
  const taxpayer = { ...simpleW2Fixture.taxpayer, taxYear: 2026,
    primary: { ...simpleW2Fixture.taxpayer.primary, employmentValidSsnIssuedByDueDate: true } };
  return {
    taxpayer,
    standardDeductionFacts: simpleW2Fixture.standardDeductionFacts,
    eic: {
      disallowanceSources: fictionalEmptyEicHistory(taxpayer),
      mfsEligible: false, primaryIsFullTimeStudent: false,
      claimantEligibility: {
        sourceTaxYear: 2026, sourceReference: 'Synthetic claimant original', sourceFactsConfirmed: true,
        primaryNonresidentAlienDuringYear: false,
        primaryChildless: { mainHomeInUnitedStatesMoreThanHalfYear: true, countedMilitaryDutyOutsideUnitedStates: false, qualifyingChildOfAnotherTaxpayer: false },
      },
    },
    scheduleC: {
      accountHolder: 'primary', accountingMethod: 'cash', qbiMateriallyParticipated: true,
      professionalWagering: {
        taxYear: 2026, ledgerReference: 'synthetic-annual-ledger',
        fullCalendarYearConfirmed: true, completeDomesticProfessionalActivityConfirmed: true,
        noOtherActivityOrDuplicatedAmountsConfirmed: true,
        grossTaxableWageringGains: '12000.15', wageringLosses: '10000.25', otherwiseDeductibleWageringExpenses: '1999.80',
        w2gSources: {
          individualOriginalsAndLedgerInclusionConfirmed: true,
          otherGrossTaxableWageringGains: '4000.10',
          statements: [
            { sourceId: 'slot-source-a', ledgerEntry: 'private-slot-ledger-a', payer: 'Synthetic Slots', payerTin: '12-3456789',
              recipientTinLast4: simpleW2Fixture.taxpayer.primary.ssn.slice(-4), winningDate: '2026-03-12', reportableWinnings: '5000.01', recognizedLedgerGain: '5000.01', federalWithheld: '1200.01' },
            { sourceId: 'slot-source-b', ledgerEntry: 'private-slot-ledger-b', payer: 'Synthetic Slots', payerTin: '12-3456789',
              recipientTinLast4: simpleW2Fixture.taxpayer.primary.ssn.slice(-4), winningDate: '2026-04-18', reportableWinnings: '3000.04', recognizedLedgerGain: '3000.04', federalWithheld: '0' },
          ],
        },
      },
    },
    formW2G: [
      { sourceId: 'slot-source-a', taxYear: 2026, accountHolder: 'primary', payer: 'Synthetic Slots', payerTin: '123456789',
        winningDate: '2026-03-12', typeOfWager: 'slots', prizeType: 'cash', reportableWinnings: '5000.01', federalWithheld: '1200.01' },
      { sourceId: 'slot-source-b', taxYear: 2026, accountHolder: 'primary', payer: 'Synthetic Slots', payerTin: '12-3456789',
        winningDate: '2026-04-18', typeOfWager: 'slots', prizeType: 'cash', reportableWinnings: '3000.04', federalWithheld: '0' },
    ],
  };
}

it('counts confirmed slot statements in Schedule C once and preserves exact federal withholding', () => {
  const raw = source();
  const input = TaxYearInputSchema.parse({ ...raw, formW2G: [...raw.formW2G].reverse() });
  const c = calculateScheduleC(input);
  expect(c.grossReceipts.toFixed()).toBe('12000.15');
  expect(c.netProfit.toFixed()).toBe('1200.105');
  const result = calculateFederalTax(input);
  const line = (form: string, label: string) => result.allLines.find(row => row.form === form && row.line === label)?.value.toFixed();
  expect(result.totalIncome.toFixed()).toBe('1200.105');
  expect(line('Sched 1', '8b') ?? '0').toBe('0');
  expect(line('1040', '25c')).toBe('1200.01');
  expect(line('1040', '25d')).toBe('1200.01');
  expect(JSON.stringify(result.allLines)).not.toMatch(/private-slot-ledger|slot-source|Synthetic Slots/);
});

it('keeps linked winnings out of Schedule 1 even when every original has zero withholding', () => {
  const original = source();
  original.formW2G[0].federalWithheld = '0.00';
  original.scheduleC.professionalWagering.w2gSources.statements[0].federalWithheld = '0';
  const input = TaxYearInputSchema.parse(original);
  expect(calculateScheduleC(input).professionalW2GWithholding?.toFixed()).toBe('0');
  const result = calculateFederalTax(input);
  expect(result.totalIncome.toFixed()).toBe('1200.105');
  expect(result.totalWithholding.toFixed()).toBe('0');
});

it('holds future Box 2 dates before posting professional winnings or withholding', () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 10, 28, 12));
  try {
    const original = source();
    const ledgerRow = original.scheduleC.professionalWagering.w2gSources.statements[0];
    const statement = original.formW2G[0];
    statement.winningDate = ledgerRow.winningDate = '2026-11-28';
    const sameDay = TaxYearInputSchema.parse(original);
    const result = calculateFederalTax(sameDay, { asOfDate: '2026-11-28' });
    expect(result.totalIncome.toFixed()).toBe('1200.105');
    expect(result.totalWithholding.toFixed()).toBe('1200.01');
    expect(() => calculateFederalTax(sameDay, { asOfDate: '2026-11-27' })).toThrow(/Box 2.*as-of date/i);
    expect(() => calculateFederalTax(sameDay, { asOfDate: '2026-11-29' })).toThrow(/valid calculation as-of date/i);

    for (const datedSource of [statement, ledgerRow]) {
      datedSource.winningDate = '2026-12-31';
      expect(() => calculateFederalTax(TaxYearInputSchema.parse(original))).toThrow(/Box 2.*as-of date/i);
      datedSource.winningDate = '2026-11-28';
    }

    for (const withholding of ['1200.01', '0']) {
      statement.federalWithheld = ledgerRow.federalWithheld = withholding;
      statement.winningDate = ledgerRow.winningDate = '2026-12-31';
      const future = TaxYearInputSchema.parse(original);
      expect(() => calculateFederalTax(future)).toThrow(/Box 2.*as-of date/i);
    }
    statement.winningDate = ledgerRow.winningDate = '2026-11-28';
    const zero = calculateFederalTax(TaxYearInputSchema.parse(original));
    expect(zero.totalIncome.toFixed()).toBe('1200.105');
    expect(zero.totalWithholding.toFixed()).toBe('0');
  } finally {
    vi.useRealTimers();
  }
});

it('rejects changed or duplicated statements and unqualified state compositions', () => {
  const original = source();
  const parsed = TaxYearInputSchema.parse(original);
  const federal = calculateFederalTax(parsed);
  expect(() => calculatePAScheduleCNetIncome(parsed)).toThrow(/professional wagering/i);
  expect(() => buildOhioResidentReturnInput(parsed, federal)).toThrow(/professional wagering/i);
  const illinois = TaxYearInputSchema.parse({ ...original, stateReturns: {
    illinois: { claimedAsDependent: false, age65OrOlderCount: 0, blindCount: 0, hasChildUnder12: false },
  } });
  expect(() => calculateFederalTax(illinois)).toThrow(/professional wagering.*state/i);
  for (const update of [
    { taxYear: 2025 }, { accountHolder: 'spouse' }, { winningDate: '2026-03-13' },
    { reportableWinnings: '5000.02' }, { federalWithheld: '1200.02' }, { federalWithheld: undefined },
    { typeOfWager: 'poker' }, { prizeType: 'noncash' }, { prizeType: undefined }, { stateWithheld: '1' },
    { localWithheld: '1' },
  ]) {
    const changed = { ...original, formW2G: [{ ...original.formW2G[0], ...update }, original.formW2G[1]] };
    expect(() => calculateScheduleC(TaxYearInputSchema.parse(changed))).toThrow();
  }
  expect(() => calculateScheduleC(TaxYearInputSchema.parse({ ...original, formW2G: original.formW2G.slice(1) }))).toThrow(/wagering/i);
  const overlapping = source();
  overlapping.formW2G[1].sourceId = overlapping.formW2G[0].sourceId;
  expect(() => calculateScheduleC(TaxYearInputSchema.parse(overlapping))).toThrow(/wagering/i);
  const samePayment = source();
  samePayment.formW2G[1] = { ...samePayment.formW2G[0], sourceId: samePayment.formW2G[1].sourceId };
  const [first, second] = samePayment.scheduleC.professionalWagering.w2gSources.statements;
  Object.assign(second, first, { sourceId: second.sourceId, ledgerEntry: second.ledgerEntry });
  expect(() => calculateScheduleC(TaxYearInputSchema.parse(samePayment))).toThrow(/uniquely distinguished/i);
  const wrongRecipient = source();
  wrongRecipient.scheduleC.professionalWagering.w2gSources.statements[0].recipientTinLast4 = '0000';
  expect(() => calculateScheduleC(TaxYearInputSchema.parse(wrongRecipient))).toThrow(/wagering/i);
  const differentSessionGain = source();
  differentSessionGain.scheduleC.professionalWagering.w2gSources.statements[0].recognizedLedgerGain = '4500.01';
  expect(() => calculateScheduleC(TaxYearInputSchema.parse(differentSessionGain))).toThrow(/recognized ledger gain/i);
  expect(() => calculateScheduleC(TaxYearInputSchema.parse({ ...original, scheduleC: undefined }))).toThrow(/wagering/i);
  const duplicateLedger = source();
  duplicateLedger.scheduleC.professionalWagering.w2gSources.statements[1].ledgerEntry =
    duplicateLedger.scheduleC.professionalWagering.w2gSources.statements[0].ledgerEntry;
  expect(() => calculateScheduleC(TaxYearInputSchema.parse(duplicateLedger))).toThrow(/wagering/i);
  const unreconciled = source();
  unreconciled.scheduleC.professionalWagering.w2gSources.otherGrossTaxableWageringGains = '4000.11';
  expect(() => calculateScheduleC(TaxYearInputSchema.parse(unreconciled))).toThrow(/wagering/i);
});
