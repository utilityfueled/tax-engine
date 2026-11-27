// Spec: spec/state/oh-2026-return-draft.yaml, pa-reciprocal-* and pa-part-year-reciprocal-*.
import Decimal from 'decimal.js';
import { describe, expect, it } from 'vitest';
import { calculateOhio2026ReturnDraftFromSources } from '@/engine/state/oh-engine.js';
import { calculateOhio2026ReturnDraft } from '@/engine/state/oh-2026-return-draft.js';
import { calculateOhio2026OrdinarySource, calculateOhio2026PaReciprocalEmployeeSource } from '@/engine/state/oh-2026-ordinary-source.js';
import { OHIO_TAX_CONSTANTS, TAX_CONSTANTS } from '@/models/constants.js';
import { ohio2026OrdinaryFixture, rebindOhio2026Ordinary } from '../../fixtures/oh-2026-ordinary-return.js';
import { ohio2026PaReciprocalFixture } from '../../fixtures/oh-2026-pa-reciprocal-return.js';

type Packet = ReturnType<typeof ohio2026PaReciprocalFixture>;
const run = (p: Packet) => calculateOhio2026ReturnDraftFromSources({ taxInput: p.input, sources: p.sources });
function current<T>(value: T | null | undefined): T {
  if (value === undefined || value === null) throw new Error('Complete fictional current source required');
  return value;
}
const wages = (p: Packet) => current(p.input.w2s[0]);
const owner = (p: Packet) => current(current(p.input.ohioResidency).owners[0]);
const row = (p: Packet) => current(p.sources.reciprocalWageSources.payrollRows[0]);

describe('Ohio2026 source-qualified PA reciprocal employee draft', () => {
  it.each(['1000', '0', '123.49', '123.50'])('refunds only actual OH withholding on source-qualified reciprocal wages: %s', withheld => {
    const p = ohio2026PaReciprocalFixture(withheld);
    const before = JSON.stringify(p);
    const result = run(p);
    expect(result.federalAgi.toFixed()).toBe('50000');
    expect(result.ohioAgi.toFixed()).toBe('0');
    expect(result.taxBeforeCredits.toFixed()).toBe('0');
    expect(result.personalExemptionCredit.toFixed()).toBe('0');
    expect(result.jointFilingCredit.toFixed()).toBe('0');
    expect(result.earnedIncomeCredit.toFixed()).toBe('0');
    expect(result.nonresidentCredit.toFixed()).toBe('0');
    expect(result.residentCredit?.toFixed()).toBe('0');
    expect(result.reciprocalWageExclusion?.toFixed()).toBe('50000');
    expect(result.ruleVersion).toBe('oh-2026-pa-reciprocal-employee-draft-v1');
    expect(result.incomeTax.toFixed()).toBe('0');
    const expected = { '1000': '1000', '0': '0', '123.49': '123', '123.50': '124' }[withheld];
    expect(result.withholding.toFixed()).toBe(expected);
    expect(result.refund.toFixed()).toBe(expected);
    expect(result.amountDue.toFixed()).toBe('0');
    expect(result.underpaymentPenalty.toFixed()).toBe('0');
    expect(result.latePaymentInterest.toFixed()).toBe('0');
    expect(result.filingQualified).toBe(false);
    expect(result.calculationStatus).toBe('incomplete');
    expect(result.reviewStatus).toBe('independent-review-pending');
    expect(JSON.stringify(p)).toBe(before);
  });

  it.each(['full-year', 'part-year'] as const)('holds a conflicting Ohio declaration of %s for full-year Pennsylvania reciprocity', stateResidency => {
    const packet = ohio2026PaReciprocalFixture('1000');
    packet.input.taxpayer.stateResidency = stateResidency;
    rebindOhio2026Ordinary(packet);

    expect(() => run(packet)).toThrow(/declared Ohio residency conflicts with the primary taxpayer's confirmed domicile records/);
  });

  it('accepts matching or omitted Ohio declarations for full-year Pennsylvania reciprocity', () => {
    const omitted = ohio2026PaReciprocalFixture('1000');
    const matching = ohio2026PaReciprocalFixture('1000');
    delete omitted.input.taxpayer.stateResidency;
    matching.input.taxpayer.stateResidency = 'nonresident';
    rebindOhio2026Ordinary(omitted);
    rebindOhio2026Ordinary(matching);

    for (const packet of [omitted, matching]) {
      const draft = run(packet);
      expect(draft.reciprocalWageExclusion?.toFixed()).toBe('50000');
      expect(draft.incomeTax.toFixed()).toBe('0');
      expect(draft.refund.toFixed()).toBe('1000');
      expect(draft.filingQualified).toBe(false);
    }
  });

  it('qualifies only complete current PA employee originals', () => {
    const mutations: Array<(p: Packet) => void> = [
      p => { p.sources.reciprocalWageSources.sourceTaxYear = 2025; },
      p => { p.sources.reciprocalWageSources.originalTaxpayer.ssn = '900-70-9999'; },
      p => { p.sources.reciprocalWageSources.originalW2.wages = '40000'; },
      p => { p.sources.reciprocalWageSources.domicileOriginal.domicileState = 'VA'; },
      p => { p.sources.reciprocalWageSources.domicileOriginal.from = '2026-01-02'; },
      p => { p.sources.reciprocalWageSources.domicileOriginal.documentDate = '2027-04-16'; },
      p => { p.sources.reciprocalWageSources.employerEntityOriginal.entityType = 'pass_through_20_percent_owner'; },
      p => { p.sources.reciprocalWageSources.employerEntityOriginal.employerTin = '90-7000999'; },
      p => { row(p).serviceState = 'VA'; },
      p => { row(p).sourceTaxYear = 2025; },
      p => { row(p).servicePeriodFrom = '2026-01-02'; },
      p => { row(p).paymentDate = '2027-01-01'; },
      p => { row(p).wages = '49999'; },
      p => { row(p).ohioWithheld = '999'; },
      p => { p.sources.reciprocalWageSources.payrollRows.push(structuredClone(row(p))); },
      p => { current(owner(p).periods[0]).domicileState = 'OH'; },
      p => { current(p.sources.employmentOriginals[0]).serviceRows[0] = { ...current(current(p.sources.employmentOriginals[0]).serviceRows[0]), serviceState: 'VA' }; },
      p => { current(p.input.ohioPayments).currentTiming = { kind: 'expected', expectedDate: '2027-04-16', asOfDate: '2027-03-01' }; },
      p => { p.input.form1099Int = [{ interest: '0' }] as never; },
      p => { wages(p).localTaxWithheld = '1'; },
      p => { p.sources.reciprocalWageSources.payrollRows = []; },
      p => { p.sources.reciprocalWageSources.sourceFactsConfirmed = false as never; },
      p => { p.sources.reciprocalWageSources.noSpecialCompensationConfirmed = false as never; },
      p => { p.sources.reciprocalWageSources.domicileOriginal.sourceTaxYear = 2025; },
      p => { p.sources.reciprocalWageSources.employerEntityOriginal.sourceTaxYear = 2025; },
      p => { p.sources.reciprocalWageSources.serviceOriginal.sourceTaxYear = 2025; },
      p => { p.sources.reciprocalWageSources.serviceOriginal.totalCompensation = '49999'; },
      p => { row(p).wages = '50000.001'; },
      p => { row(p).ohioWithheld = '1000.001'; },
      p => { row(p).paymentDate = '2026-12-30'; },
      p => { p.input.taxpayer.filingStatus = 'head_of_household'; },
      p => { owner(p).status = 'full_year_resident'; },
    ];
    for (const [index, mutate] of mutations.entries()) {
      const p = ohio2026PaReciprocalFixture();
      mutate(p);
      current(p.input.ohioResidency).reciprocalWageSources = structuredClone(p.sources.reciprocalWageSources);
      rebindOhio2026Ordinary(p);
      expect(() => run(p), `unsupported original mutation ${index}`).toThrow();
    }
    const p = ohio2026PaReciprocalFixture();
    expect(() => calculateOhio2026OrdinarySource(p.input, p.sources)).toThrow();
  });

  it('rejects stale and forged reciprocal contexts without changing historical gates', () => {
    const p = ohio2026PaReciprocalFixture();
    const result = run(p);
    const context = calculateOhio2026PaReciprocalEmployeeSource(p.input, p.sources);
    expect(() => calculateOhio2026ReturnDraft(p.input, p.sources, { ...context })).toThrow(/forged/);
    p.sources.reciprocalWageSources.sourceReference += '-new-original';
    expect(() => calculateOhio2026ReturnDraft(p.input, p.sources, context)).toThrow(/stale/);
    expect(() => run(p)).toThrow();
    current(p.input.ohioResidency).reciprocalWageSources = structuredClone(p.sources.reciprocalWageSources);
    const next = run(p);
    expect(next.sourceCommitment).not.toBe(result.sourceCommitment);
    expect(next.refund.toFixed()).toBe('1000');
    expect(TAX_CONSTANTS[2026]).toBeUndefined();
    expect(OHIO_TAX_CONSTANTS[2026]).toBeUndefined();
  });
});

const partYearMethod = 'oh-2026-pa-part-year-reciprocal-employee-draft-v1';
type Move = 'PA to OH' | 'OH to PA';

function partYearFixture(move: Move = 'PA to OH', ohWages = '40000', paWages = '25000', paWithheld = '767.50') {
  const annualWages = new Decimal(ohWages).plus(paWages).toFixed();
  const p = ohio2026OrdinaryFixture('part_year_resident', annualWages, ohWages);
  p.input.taxpayer.stateResidency = 'part-year';
  const stateOrder = move === 'PA to OH' ? ['PA', 'OH'] as const : ['OH', 'PA'] as const;
  const domicile = current(current(p.input.ohioResidency).owners[0]);
  stateOrder.forEach((state, index) => { current(domicile.periods[index]).domicileState = state; });
  const w2 = current(p.input.w2s[0]), stateLocal = current(w2.stateLocalSources);
  w2.stateWages = ohWages;
  stateLocal.originalW2.stateWages = ohWages;
  current(stateLocal.stateRows[0]).wages = ohWages;
  if (paWithheld !== '0') {
    stateLocal.stateReporting = 'multiple';
    stateLocal.stateRows.push({
      printedRow: 2, sourceReference: 'ACTUAL-PA-PRINTED-ROW', state: 'PA',
      employerStateIDStatus: 'reported', employerStateID: 'ACTUAL-PA-EMPLOYER-ID', wages: paWages, withheld: paWithheld,
    });
  }
  const { domicileOriginal, ...reciprocal } = ohio2026PaReciprocalFixture().sources.reciprocalWageSources;
  const { completeYearDomicileConfirmed: _yearOnly, ...periodOriginal } = domicileOriginal;
  const payroll = current(p.sources.employmentOriginals[0]).serviceRows;
  const partYearReciprocalWageSources = {
    ...reciprocal,
    originalW2: structuredClone(w2),
    serviceOriginal: { ...reciprocal.serviceOriginal, totalCompensation: annualWages },
    domicileOriginals: domicile.periods.map((period, index) => ({
      ...periodOriginal, ...period, sourceId: `ACTUAL-DOMICILE-${index}`, completeDomicilePeriodConfirmed: true,
    })),
    payrollRows: payroll.map((row, index) => {
      const isOhio = stateOrder[index] === 'OH';
      row.serviceState = 'OH';
      row.wages = isOhio ? ohWages : paWages;
      return {
        ...current(reciprocal.payrollRows[0]), sourceId: row.sourceId, sourceReference: row.sourceReference,
        servicePeriodFrom: row.from, servicePeriodTo: row.to, paymentDate: row.paymentDate, serviceState: 'OH',
        wages: row.wages, ohioWithheld: isOhio ? '800' : '200', pennsylvaniaWithheld: isOhio ? '0' : paWithheld,
      };
    }),
  };
  const packet = { input: p.input, sources: { ...p.sources, methodId: partYearMethod, partYearReciprocalWageSources } };
  rebindOhio2026Ordinary(packet);
  return packet;
}

type PartYearPacket = ReturnType<typeof partYearFixture>;
const runPartYear = ({ input, sources }: PartYearPacket) => calculateOhio2026ReturnDraftFromSources({ taxInput: input, sources });
const partYearProof = (p: PartYearPacket) => p.sources.partYearReciprocalWageSources;
const payRow = (p: PartYearPacket, index = 0) => current(partYearProof(p).payrollRows[index]);
const home = (p: PartYearPacket, index = 0) => current(partYearProof(p).domicileOriginals[index]);

function rebindPartYearBox16(p: PartYearPacket, state: 'OH' | 'PA', wageAmount: string) {
  const w2 = current(p.input.w2s[0]), stateLocal = current(w2.stateLocalSources);
  current(stateLocal.stateRows.find(row => row.state === state)).wages = wageAmount;
  if (state === w2.state) {
    w2.stateWages = wageAmount;
    stateLocal.originalW2.stateWages = wageAmount;
  }
  partYearProof(p).originalW2 = structuredClone(w2);
  rebindOhio2026Ordinary(p);
}

describe('Ohio private 2026 part-year PA reciprocal wage draft', () => {
  it.each<Move>(['PA to OH', 'OH to PA'])('reconciles documented Ohio reciprocal wages in both move directions (%s)', move => {
    const p: PartYearPacket = JSON.parse(JSON.stringify(partYearFixture(move)));
    const before = JSON.stringify(p);
    const result = runPartYear(p);
    expect(result).toMatchObject({
      ruleVersion: partYearMethod, calculationStatus: 'incomplete',
      reviewStatus: 'independent-review-pending', filingQualified: false,
    });
    expect(result.federalAgi.toFixed()).toBe('65000');
    expect(result.reciprocalWageExclusion?.toFixed()).toBe('25000');
    expect(result.ohioAgi.toFixed()).toBe('40000');
    expect(result.exemptions.toFixed()).toBe('2400');
    // RC 5747.02: $332 + ($40,000 - $2,400 - $26,050) × .0275 = $649.625.
    expect(result.incomeTax.toFixed()).toBe('650');
    expect(result.withholding.toFixed()).toBe('1000');
    expect(result.refund.toFixed()).toBe('350');
    expect(result.nonresidentCredit.toFixed()).toBe('0');
    expect(result.residentCredit?.toFixed()).toBe('0');
    expect(result.lines.find(line => line.form === 'OH-IT-NRC' && line.line === '1')?.value.toFixed()).toBe('40000');
    expect(result.lines.find(line => line.form === 'OH-IT-NRC' && line.line === '18')?.value.toFixed()).toBe('0');
    expect(JSON.stringify(p)).toBe(before);
    expect(JSON.stringify(result.lines)).not.toContain(home(p).sourceId);
  });

  it.each<Move>(['PA to OH', 'OH to PA'])('accepts full Ohio-service payroll in Box 16 (%s)', move => {
    const p = partYearFixture(move);
    rebindPartYearBox16(p, 'OH', '65000');
    const result = runPartYear(p);
    expect(result.reciprocalWageExclusion?.toFixed()).toBe('25000');
    expect(result.ohioAgi.toFixed()).toBe('40000');
    expect(result.withholding.toFixed()).toBe('1000');
    expect(result.refund.toFixed()).toBe('350');
  });

  it.each<[string, Move, 'OH' | 'PA', string]>([
    ['Ohio, PA to OH', 'PA to OH', 'OH', '40000.01'],
    ['Ohio, OH to PA', 'OH to PA', 'OH', '64999.99'],
    ['Pennsylvania, PA to OH', 'PA to OH', 'PA', '24999.99'],
    ['Pennsylvania, OH to PA', 'OH to PA', 'PA', '40000'],
  ])('holds contradictory rebound state Box 16 wages (%s)', (_kind, move, state, amount) => {
    const p = partYearFixture(move);
    rebindPartYearBox16(p, state, amount);
    expect(() => runPartYear(p)).toThrow(/printed .* Box 16 wages do not reconcile/i);
  });

  it('applies the exact part-year reciprocity deduction before rounding Ohio AGI', () => {
    const result = runPartYear(partYearFixture('PA to OH', '39999.98', '25000.51', '0'));
    expect(result.federalAgi.toFixed()).toBe('65000');
    expect(result.reciprocalWageExclusion?.toFixed()).toBe('25000.51');
    expect(result.ohioAgi.toFixed()).toBe('40000');
    expect(result.nonresidentRatio.toFixed()).toBe('0');
    expect(result.refund.toFixed()).toBe('350');
  });

  it.each<[string, (p: PartYearPacket) => void, RegExp]>([
    ['unknown PA withholding', p => { Reflect.deleteProperty(payRow(p), 'pennsylvaniaWithheld'); }, /complete confirmed part-year reciprocal originals/i],
    ['missing move original', p => { partYearProof(p).domicileOriginals.pop(); }, /complete confirmed part-year reciprocal originals/i],
    ['duplicate domicile original', p => { home(p, 1).sourceId = home(p).sourceId.toLowerCase(); }, /distinct current domicile originals/i],
    ['wrong taxpayer', p => { home(p).ssn = '900-70-9999'; }, /domicile originals differ/i],
    ['unknown domicile boundary', p => { home(p).to = '2026-06-29'; }, /domicile originals differ/i],
    ['declared full year', p => { p.input.taxpayer.stateResidency = 'full-year'; }, /declared Ohio residency conflicts/i],
    ['stale W-2', p => { partYearProof(p).originalW2.wages = '64999'; }, /taxpayer or W-2 identity differs/i],
    ['wrong payroll employer', p => { payRow(p).employerTin = '90-7000999'; }, /Ohio services, owner and employer/i],
    ['other service location', p => { payRow(p).serviceState = 'PA'; }, /Ohio services, owner and employer/i],
    ['unmatched ordinary payroll', p => { current(current(p.sources.employmentOriginals[0]).serviceRows[0]).wages = '25001'; }, /ordinary service originals differ/i],
    ['cross-move payment', p => {
      payRow(p).paymentDate = '2026-07-01';
      current(current(p.sources.employmentOriginals[0]).serviceRows[0]).paymentDate = '2026-07-01';
    }, /crosses confirmed domicile/i],
    ['unreconciled Ohio withholding', p => { payRow(p).ohioWithheld = '199.99'; }, /payroll state withholding does not reconcile/i],
    ['unreconciled PA withholding', p => { payRow(p).pennsylvaniaWithheld = '767.51'; }, /payroll state withholding does not reconcile/i],
    ['PA withholding on Ohio-resident wages', p => {
      payRow(p, 1).pennsylvaniaWithheld = '0.01';
      payRow(p).pennsylvaniaWithheld = '767.49';
    }, /Pennsylvania withholding on Ohio-resident compensation/i],
    ['duplicated credit claim', p => { current(current(current(p.input.ohioResidency).owners[0]).amounts).wages.nonresidentOhioAmount = '25000'; },
      /source categories and service allocation differ/i],
  ])('holds incomplete or conflicting part-year reciprocal originals (%s)', (_kind, change, expected) => {
    const p = partYearFixture();
    change(p);
    rebindOhio2026Ordinary(p);
    expect(() => runPartYear(p)).toThrow(expected);
  });
});
