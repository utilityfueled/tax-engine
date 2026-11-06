// Spec: spec/state/oh-2026-return-draft.yaml, pa-reciprocal-* entries.
import { describe, expect, it } from 'vitest';
import { calculateOhio2026ReturnDraftFromSources } from '@/engine/state/oh-engine.js';
import { calculateOhio2026ReturnDraft } from '@/engine/state/oh-2026-return-draft.js';
import { calculateOhio2026OrdinarySource, calculateOhio2026PaReciprocalEmployeeSource } from '@/engine/state/oh-2026-ordinary-source.js';
import { OHIO_TAX_CONSTANTS, TAX_CONSTANTS } from '@/models/constants.js';
import { rebindOhio2026Ordinary } from '../../fixtures/oh-2026-ordinary-return.js';
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
