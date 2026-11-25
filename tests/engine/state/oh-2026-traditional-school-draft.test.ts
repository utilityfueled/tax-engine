// Spec: spec/state/oh-2026-traditional-school-draft.yaml
import { expect, it } from 'vitest';
import { Form1099IntSchema } from '@/models/inputs.js';
import { calculateOhio2026SchoolSource } from '@/engine/state/oh-2026-school-source.js';
import { calculateOhio2026TraditionalSchoolDraft } from '@/engine/state/oh-engine.js';
import { ohio2026SchoolFixture, rebindOhio2026School } from '../../fixtures/ohio-2026-school.js';

function original<T>(value: T | null | undefined): T {
  if (value === undefined || value === null) throw Error('Complete fictional actual original required');
  return value;
}

function traditional(wages = '50000') {
  const packet = ohio2026SchoolFixture(wages, '0');
  const { input, sources } = packet;
  const { residence } = sources;
  residence.districtCode = '0909';
  Object.assign(residence.finder, { districtCode: '0909', districtName: 'Talawanda CSD', taxBase: 'traditional', rate: '0.0100' });
  const w2 = original(input.w2s[0]);
  w2.localityName = '0909 Talawanda CSD';
  original(w2.stateLocalSources?.localRows[0]).localityName = w2.localityName;
  original(sources.w2Sources[0]?.localRows[0]).districtCode = '0909';
  rebindOhio2026School(packet);
  return {
    input,
    sources: {
      methodId: 'oh-2026-traditional-school-employee-levy-draft-v1',
      schoolSources: sources,
      levyCoverageSourceReference: 'PRIVATE-ANNUAL-LEVY-COVERAGE',
      levyInEffectAllYearConfirmed: true,
      roundingElection: 'whole_dollars',
      roundingElectionConfirmed: true,
    },
  };
}

it('uses the published district rate and exact statutory exemption boundaries', () => {
  for (const [wages, exemption, base, levy] of [
    ['40000', '2400', '37600', '376'],
    ['40001', '2150', '37851', '379'],
    ['80000', '2150', '77850', '779'],
    ['80001', '1900', '78101', '781'],
    ['499999', '1900', '498099', '4981'],
    ['500000', '0', '500000', '5000'],
  ]) {
    const { input, sources } = traditional(wages);
    const result = calculateOhio2026TraditionalSchoolDraft(input, sources);
    expect(result.districtCode).toBe('0909');
    expect(result.rate.toFixed()).toBe('0.01');
    expect(result.modifiedAdjustedGrossIncome.toFixed()).toBe(wages);
    expect(result.exemptions.toFixed()).toBe(exemption);
    expect(result.taxableIncome.toFixed()).toBe(base);
    expect(result.reportedTaxBeforeCredits.toFixed()).toBe(levy);
  }
});

it('retains exact levy, rounds the half dollar and reports a real zero with a private audit', () => {
  const p = traditional('2450');
  const originals = JSON.stringify(p);
  const result = calculateOhio2026TraditionalSchoolDraft(p.input, p.sources);
  expect(result).toMatchObject({ taxYear: 2026, calculationStatus: 'incomplete', reviewStatus: 'independent-review-pending', filingQualified: false });
  expect(result.rawTaxBeforeCredits.toFixed()).toBe('0.5');
  expect(result.reportedTaxBeforeCredits.toFixed()).toBe('1');
  expect(result.lines.map(({ line, value }) => [line, value.toFixed()])).toEqual([['school-base', '50'], ['school-levy', '1']]);
  expect(JSON.stringify(result)).not.toContain('PRIVATE-');
  expect(JSON.stringify(result)).not.toContain(p.input.taxpayer.primary.ssn);
  expect(JSON.stringify(p)).toBe(originals);
  const zero = traditional('2399');
  const zeroResult = calculateOhio2026TraditionalSchoolDraft(zero.input, zero.sources);
  expect(zeroResult.taxableIncome.toFixed()).toBe('0');
  expect(zeroResult.reportedTaxBeforeCredits.toFixed()).toBe('0');
  const belowHalf = traditional('2449');
  const belowHalfResult = calculateOhio2026TraditionalSchoolDraft(belowHalf.input, belowHalf.sources);
  expect(belowHalfResult.rawTaxBeforeCredits.toFixed()).toBe('0.49');
  expect(belowHalfResult.reportedTaxBeforeCredits.toFixed()).toBe('0');
});

it('holds unsupported or unverified traditional school facts and retains the earned proof boundary', () => {
  const earned = ohio2026SchoolFixture();
  expect(() => calculateOhio2026SchoolSource(earned.input, earned.sources)).not.toThrow();
  expect(() => calculateOhio2026TraditionalSchoolDraft(earned.input, { ...traditional().sources, schoolSources: earned.sources })).toThrow(/traditional/);
  const p = traditional();
  expect(() => calculateOhio2026SchoolSource(p.input, p.sources.schoolSources)).toThrow(/earned/);
  expect(() => calculateOhio2026TraditionalSchoolDraft(p.input, { ...p.sources, levyInEffectAllYearConfirmed: false })).toThrow(/complete/);
  expect(() => calculateOhio2026TraditionalSchoolDraft(p.input, { ...p.sources, levyCoverageSourceReference: '' })).toThrow(/complete/);
  expect(() => calculateOhio2026TraditionalSchoolDraft(p.input, { ...p.sources, roundingElectionConfirmed: undefined })).toThrow(/complete/);
  const cents = traditional('50000.01');
  expect(() => calculateOhio2026TraditionalSchoolDraft(cents.input, cents.sources)).toThrow(/whole-dollar aggregate/);

  for (const status of ['part-year', 'nonresident'] as const) {
    const conflict = traditional();
    conflict.input.taxpayer.stateResidency = status;
    rebindOhio2026School({ input: conflict.input, sources: conflict.sources.schoolSources });
    expect(() => calculateOhio2026TraditionalSchoolDraft(conflict.input, conflict.sources)).toThrow(/full-year residency/);
  }
  const unemploymentPayment = { sourceReference: 'PRIVATE-PAYMENT', paidOrAccruedOn: '2026-03-19', amount: '0.00' };
  for (const evidence of [
    { unemploymentPaymentSource: { ...unemploymentPayment, allPaymentsIncludedConfirmed: true, originalSourceId: 'PRIVATE-1099-G' } },
    { unemploymentPaymentSchedule: { allPaymentsIncludedConfirmed: true, originalSourceId: 'PRIVATE-1099-G',
      payments: [unemploymentPayment, { ...unemploymentPayment, paidOrAccruedOn: '2026-06-22' }] } },
  ]) {
    const conflict = traditional();
    Object.assign(original(conflict.input.ohioResidency), evidence);
    rebindOhio2026School({ input: conflict.input, sources: conflict.sources.schoolSources });
    expect(() => calculateOhio2026TraditionalSchoolDraft(conflict.input, conflict.sources)).toThrow(/unemployment/);
  }

  const placeholder = traditional();
  placeholder.input.taxpayer.primary.ssn = '000-00-0000';
  placeholder.sources.schoolSources.owner.originalTaxpayer = structuredClone(placeholder.input.taxpayer.primary);
  rebindOhio2026School({ input: placeholder.input, sources: placeholder.sources.schoolSources });
  expect(() => calculateOhio2026TraditionalSchoolDraft(placeholder.input, placeholder.sources)).toThrow(/taxpayer identifier/);
  const placeholderEmployer = traditional();
  original(placeholderEmployer.input.w2s[0]).employer.ein = '00-0000000';
  original(placeholderEmployer.sources.schoolSources.employmentOriginals[0]).employerTin = '00-0000000';
  rebindOhio2026School({ input: placeholderEmployer.input, sources: placeholderEmployer.sources.schoolSources });
  expect(() => calculateOhio2026TraditionalSchoolDraft(placeholderEmployer.input, placeholderEmployer.sources)).toThrow(/employer identifier/);

  for (const edit of [
    ({ sources }) => { sources.schoolSources.owner.originalTaxpayer.ssn = '900-70-9999'; },
    ({ sources }) => { sources.schoolSources.residence.finder.rate = '0.0200'; },
    ({ sources }) => { sources.schoolSources.residence.finder.lookupDate = '2025-12-31'; },
    ({ sources }) => { original(sources.schoolSources.employmentOriginals[0]?.serviceRows[0]).wages = '1'; },
    ({ input }) => { original(input.w2s[0]).taxYear = 2025; },
    ({ input }) => { original(input.standardDeductionFacts).primaryCanBeClaimedAsDependent = true; },
    ({ input }) => { input.form1099Int = [Form1099IntSchema.parse({ taxYear: 2026, payer: 'Fictional Bank', interestIncome: '0' })]; },
  ] satisfies Array<(packet: ReturnType<typeof traditional>) => void>) {
    const q = traditional();
    edit(q);
    rebindOhio2026School({ input: q.input, sources: q.sources.schoolSources });
    expect(() => calculateOhio2026TraditionalSchoolDraft(q.input, q.sources)).toThrow();
  }
});
