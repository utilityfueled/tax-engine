import { expect, it, vi } from 'vitest';
vi.mock('@/models/constants.js', async importOriginal => {
  const original = await importOriginal<typeof import('@/models/constants.js')>();
  const { FEDERAL_2026_CONSTANTS } = await import('@/models/federal-2026-indexed.js');
  return { ...original, getConstants: (year: number) => year === 2026 ? FEDERAL_2026_CONSTANTS : original.getConstants(year) };
});
import type Decimal from 'decimal.js';
import { calculateFederalTax } from '@/engine/federal';
import { calculateK1CharitableReturnSources } from '@/engine/forms/k1-charitable-return-sources';
import { firstAdmissionInput, firstAdmissionOriginal } from '../fixtures/k1-charitable-first-admission';
import { priorPropertyNonitemizedInput, priorPropertySources } from '../fixtures/k1-prior-property-nonitemized';
import { releaseFixtureSource as required } from '../fixtures/charitable-k1-basis-release-nol';

type Admission = { sourceId: string; originalGiftDate: string; basisOriginTaxYear: number; admissionTaxYear: number;
  lastCarryYear: number; originalBasis: Decimal; previouslyAllowedBasis: Decimal; currentAdmission: Decimal; remainingBasisSuspension: Decimal };
function admission(input: ReturnType<typeof firstAdmissionInput>) {
  const source = required(calculateK1CharitableReturnSources(input));
  return (source.statements[0] as typeof source.statements[0] & { firstAdmissions?: Admission[] }).firstAdmissions?.[0];
}

it('derives the current admission year without reusing historical basis or appreciation', () => {
  // Spec: K1 Charitable First Admission, new-admission.
  for (const sCorp of [false, true]) for (const election of ['standard', 'nonitemized', 'itemized', 'automatic'] as const) {
    const input = firstAdmissionInput({ sCorp, election }), before = JSON.stringify(input);
    const result = calculateFederalTax(input), proof = required(admission(input));
    expect([proof.originalGiftDate, proof.basisOriginTaxYear, proof.admissionTaxYear, proof.lastCarryYear])
      .toEqual(['2018-06-01', 2018, 2026, 2031]);
    expect([proof.originalBasis, proof.previouslyAllowedBasis, proof.currentAdmission, proof.remainingBasisSuspension].map(value => value.toFixed()))
      .toEqual(['80000', '20000', '40000', '20000']);
    expect(result.carryforwards.charitableContributions.toFixed()).toBe('10500');
    expect(result.carryforwards.charitableContributionsByYear.map(row => [row.taxYear, row.category, row.amount.toFixed()]))
      .toEqual([[2026, 'capital_gain_30', '10500']]);
    expect(JSON.stringify(input)).toBe(before);
  }
});

it('keeps category capacity zero base and current cash separate', () => {
  // Spec: K1 Charitable First Admission, category-and-zero-base.
  for (const [options, expected] of [
    [{ capacity: '30000', category: 'D' as const }, '10500'],
    [{ income: '0' }, '40000'], [{ capacity: '30000' }, '0'],
  ] as const) expect(calculateFederalTax(firstAdmissionInput(options)).carryforwards.charitableContributions.toFixed()).toBe(expected);
  const input = firstAdmissionInput();
  input.donations = [{ organization: 'Fictional separate current cash recipient', type: 'cash', amount: '1000', dateOfDonation: '2026-09-01',
    qualifiedOrganization: true, recipientCategory: 'fifty-percent', isPrivateFoundation: false, donorAdvisedFund: false, supportingOrganization: false }];
  const result = calculateFederalTax(input);
  expect(result.nonitemizerCharitableDeduction?.toFixed()).toBe('1000');
  expect(result.carryforwards.charitableContributions.toFixed()).toBe('10500');
});

it('preserves linked earlier section170 slices and independent alternative history', () => {
  // Spec: K1 Charitable First Admission, earlier-slice.
  const input = firstAdmissionInput({ earlierCarry: true }), before = JSON.stringify(input);
  const result = calculateFederalTax(input);
  expect(result.carryforwards.charitableContributions.toFixed()).toBe('15500');
  expect(result.carryforwards.charitableContributionsByYear.map(row => [row.taxYear, row.amount.toFixed()] as const).sort((a, b) => a[0] - b[0]))
    .toEqual([[2024, '5000'], [2026, '10500']]);
  expect(result.netOperatingLoss?.determinedCharitableCarryover?.carryforward.toFixed()).toBe('15500');
  expect(result.netOperatingLoss?.determinedAlternativeCharitableCarryover?.carryforward.toFixed()).toBe('14500');
  const admission = required(calculateK1CharitableReturnSources(input)).statements[0].firstAdmissions![0];
  for (const [history, originalExcess, opening] of [
    [admission.earlierRegularAdmissions, '7000', '5000'],
    [admission.earlierAlternativeAdmissions!, '6000', '4000'],
  ] as const) {
    expect(history[0].admissionTaxYear).toBe(2024); expect(history[0].lastCarryYear).toBe(2029);
    expect([history[0].originalExcess, history[0].originNolReduction, history[0].openingCarryforward].map(value => value.toFixed()))
      .toEqual([originalExcess, '0', opening]);
    expect(history[0].history.map(row => [row.taxYear, row.treatedAsPaid.toFixed(), row.nolReduction.toFixed()])).toEqual([[2025, '2000', '0']]);
  }
  expect(JSON.stringify(input)).toBe(before);
  const reordered = structuredClone(input);
  required(firstAdmissionOriginal(reordered).section170AdmissionSources).records!.reverse();
  required(firstAdmissionOriginal(reordered).basisUseHistory).reverse();
  expect(calculateFederalTax(reordered).carryforwards.charitableContributions.toFixed()).toBe('15500');
});

it('requires actual annual identity and original admitted amount conservation', () => {
  // Spec: K1 Charitable First Admission, original-binding.
  const mutations: Array<(input: ReturnType<typeof firstAdmissionInput>) => void> = [
    input => { required(firstAdmissionOriginal(input).section170AdmissionSources).sourceFactsConfirmed = false; },
    input => { required(firstAdmissionOriginal(input).section170AdmissionSources).records!.pop(); },
    input => { required(firstAdmissionOriginal(input).section170AdmissionSources).records![0].recipientName = 'Different Actual Owner'; },
    input => { required(firstAdmissionOriginal(input).section170AdmissionSources).records![0].entityEIN = '12-3456789'; },
    input => { required(firstAdmissionOriginal(input).section170AdmissionSources).records![0].entityType = 's_corporation'; },
    input => { required(input.charitableCarryoverSources).vintages![0].category = 'capital_gain_20'; },
    input => { const p = required(input.charitableCarryoverSources).vintages![0]; p.originalExcess = '25000'; p.history![0].treatedAsPaid = '20000'; },
    input => { required(input.charitableCarryoverSources).vintages![0].history![0].treatedAsPaid = '1999'; },
    input => { required(firstAdmissionOriginal(input).section170AdmissionSources).records!.find(row => row.taxYear === 2024)!.regularCarryoverSourceIds = []; },
    input => { const p = required(firstAdmissionOriginal(input).section170AdmissionSources); p.records![0].regularCarryoverSourceIds = [...p.records!.find(row => row.taxYear === 2024)!.regularCarryoverSourceIds!]; },
  ];
  for (const mutate of mutations) {
    const input = firstAdmissionInput({ earlierCarry: true }); mutate(input);
    expect(() => calculateK1CharitableReturnSources(input)).toThrow(/first.admission|section170|charitable.*history|Charitable history/i);
  }
  const zero = firstAdmissionInput({ capacity: '0' });
  required(firstAdmissionOriginal(zero).section170AdmissionSources).sourceFactsConfirmed = false;
  expect(() => calculateK1CharitableReturnSources(zero)).toThrow(/first.admission|section170/i);
});

it('preserves legacy and historical risk boundaries', () => {
  // Spec: K1 Charitable First Admission, legacy-and-risk-boundary.
  expect(() => calculateFederalTax(priorPropertyNonitemizedInput())).toThrow(/first.section170.entry|contribution.year/);
  expect(calculateFederalTax(priorPropertyNonitemizedInput({ capacity: '20000' })).carryforwards.charitableContributions.toFixed()).toBe('0');
  const mixed = priorPropertyNonitemizedInput({ method: 'both' });
  firstAdmissionOriginal(mixed).section170AdmissionSources = structuredClone(firstAdmissionOriginal(firstAdmissionInput()).section170AdmissionSources);
  expect(() => calculateFederalTax(mixed)).toThrow(/risk|first.admission|contribution.year/);
  expect(required(priorPropertySources(mixed).receipts)[0].contributionDate).toBe('2018-06-01');
});

it('composes the proved admission with the established zero-benefit NOL method', () => {
  // Spec: K1 Charitable First Admission, established-nol.
  const input = firstAdmissionInput({ oldNol: true }), before = JSON.stringify(input), result = calculateFederalTax(input);
  expect([result.nolDeduction, result.agi, result.carryforwards.nolCarryforward].map(value => value.toFixed())).toEqual(['67120', '32880', '32880']);
  expect(result.netOperatingLoss?.determinedCharitableCarryover?.reduction.toFixed()).toBe('0');
  expect(result.carryforwards.charitableContributions.toFixed()).toBe('30300.4');
  expect(JSON.stringify(input)).toBe(before);
});

it('preserves multiple original basis allocations and exact cents under reordering', () => {
  // Spec: K1 Charitable First Admission, multiple-originals.
  const input = firstAdmissionInput({ capacity: '40000.02' }), original = firstAdmissionOriginal(input);
  const second = structuredClone(original);
  second.sourceId = 'actual-prior-basis-2019'; second.originTaxYear = 2019;
  second.sourceReference = 'Fictional distinct original2019 basis property';
  second.basisUseHistory = original.basisUseHistory!.filter(row => row.taxYear! >= 2019).map(row => ({ ...row, basisAllowed: row.taxYear === 2019 ? '20000' : '0' }));
  second.section170AdmissionSources!.records = original.section170AdmissionSources!.records!.filter(row => row.taxYear! >= 2019).map(row => ({ ...row,
    basisWorksheetReference: `Fictional filed ${row.taxYear} basis worksheet for distinct2019 property`,
    charitableWorksheetReference: `Fictional filed ${row.taxYear} distinct2019 charitable worksheet`,
  }));
  const statement = priorPropertySources(input);
  statement.basis!.priorBasisSuspensions!.push(second);
  input.scheduleK1[0].priorSuspendedLosses!.charitable = '120000';
  statement.receipts!.push({ ...structuredClone(statement.receipts![0]), basisSourceId: second.sourceId,
    recipientName: 'Fictional distinct2019 recipient', sourceReference: 'Fictional distinct original2019 receipt', contributionDate: '2019-06-01' });
  const before = JSON.stringify(input), source = required(calculateK1CharitableReturnSources(input));
  expect(source.statements[0].firstAdmissions?.map(row => [row.sourceId, row.currentAdmission.toFixed()]))
    .toEqual([['actual-prior-basis-2018', '20000.01'], ['actual-prior-basis-2019', '20000.01']]);
  expect(calculateFederalTax(input).carryforwards.charitableContributions.toFixed()).toBe('10500.02');
  expect(JSON.stringify(input)).toBe(before);
  statement.basis!.priorBasisSuspensions!.reverse(); statement.receipts!.reverse();
  expect(calculateFederalTax(input).carryforwards.charitableContributions.toFixed()).toBe('10500.02');
  expect(required(calculateK1CharitableReturnSources(input)).statements[0].firstAdmissions?.map(row => row.originalGiftDate).sort())
    .toEqual(['2018-06-01', '2019-06-01']);
});
