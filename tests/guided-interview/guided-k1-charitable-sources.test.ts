// Spec: spec/federal/guided-k1-charitable-sources.yaml.
import { expect, it } from 'vitest';
import { actualGuidedK1Charity, actualGuidedLinkedK1Charity } from '../fixtures/guided-k1-charitable-sources';
import { startCompleteInterview, completeW2Entry } from './complete-facts';
import { emptyDeductionData, validateSection } from '@/lib/guided-interview-flow';
import { buildTaxInputFromGuidedData } from '@/lib/guided-interview-bridge';
import { calculateFederalTax } from '@/engine/federal';
import { TaxYearInputSchema } from '@/models/inputs';
import { actualGuidedK1Sources } from '../fixtures/guided-k1-qbi-sources';
import { buildGuidedK1CharitableSources, updateK1CharitableSources } from '@/lib/guided-k1-charitable-sources';
import { updateSectionData } from '@/lib/guided-interview-flow';
import type { K1CharitableStatementData } from '@/lib/guided-k1-charitable-data';

export function guidedK1CharityState() {
  const state = startCompleteInterview({ filingStatus: 'single', incomeTypes: ['w2-wages'], lifeEvents: [], stateCode: null });
  state.sectionData['income-w2'] = { entries: [{ ...completeW2Entry, wages: '100000' }] };
  state.sectionData.deductions = { ...emptyDeductionData, method: 'itemized', medicalExpenses: '0', stateLocalTaxes: '0', realEstateTaxes: '0', mortgageInterest: '0',
    charitableContributions: '0', casualtyLosses: '0', otherItemized: '0', gamblingWinnings: '0', nonW2IncomeTaxesDeductedElsewhere: '0', donationEntries: [], k1CharitableSources: actualGuidedK1Charity() };
  return state;
}

it('retains original charitable K1 facts and derives the published basis result', () => {
  const state = guidedK1CharityState(), before = JSON.stringify(state);
  expect(validateSection(state, 'deductions').status).toBe('complete');
  const input = buildTaxInputFromGuidedData(state);
  expect(input?.scheduleK1?.[0]?.charitableCapitalGain30).toBe('150.00');
  expect(input?.scheduleK1?.[0]?.beginningBasis).toBe('30.00');
  expect(input?.k1CharitableSources?.statements?.[0].basis?.currentContributions?.[0].adjustedBasisShare).toBe('50.00');
  expect(input).not.toHaveProperty('charitableDeductionOverride');
  const result = calculateFederalTax(TaxYearInputSchema.parse(input));
  expect(result.scheduleA?.charitableTotal.toFixed()).toBe('130');
  expect(JSON.stringify(state)).toBe(before);
  const scorp = guidedK1CharityState(), s = scorp.sectionData.deductions?.k1CharitableSources?.statements?.[0];
  if (!s?.original?.form6198 || !s.basis?.currentContributions?.[0] || !s.receipts?.[0]) throw new Error('Missing fictional S-corporation source');
  Object.assign(s.original, { entityType: 's_corporation', beginningBasis: '50', ordinaryIncome: '30', netLongTermCapitalGain: '-25', charitableCapitalGain30: '190',
    beginningDebtBasis: '0', additionalLoansToScorp: '0', priorDebtBasisReduction: '0', election1367: false });
  s.basis.entityType = 's_corporation';
  Object.assign(s.basis.currentContributions[0], { contributionShare: '190', adjustedBasisShare: '100' });
  Object.assign(s.receipts[0], { originalBox: '12', fairMarketValueShare: '190' });
  Object.assign(s.original.form6198, { ordinaryIncome: '30', gainLossFromDispositions: '-16' });
  const sr = calculateFederalTax(TaxYearInputSchema.parse(buildTaxInputFromGuidedData(scorp)));
  expect(sr.scheduleA?.charitableTotal.toFixed()).toBe('154'); expect(sr.scheduleD?.netLongTerm.toFixed()).toBe('-16'); expect(sr.agi.toFixed()).toBe('100014');
  const duplicate = guidedK1CharityState(), packet = duplicate.sectionData.deductions?.k1CharitableSources;
  if (!packet?.statements?.[0]) throw new Error('Missing fictional packet'); packet.statements.push(structuredClone(packet.statements[0]));
  expect(buildTaxInputFromGuidedData(duplicate)).toBeNull();
});

it('requires original identity amounts and independently complete histories', () => {
  const changes: ((source: K1CharitableStatementData) => void)[] = [
    source => { if (source.original?.form6198) source.original.form6198.ordinaryIncome = ''; },
    source => { if (source.original?.form6198) source.original.form6198.currentYearIncreases = undefined; },
    source => { if (source.original) source.original.beginningBasis = ''; },
    source => { if (source.original) source.original.taxYear = '2024'; },
    source => { if (source.original) source.original.accountHolder = 'spouse'; },
    source => { if (source.original) source.original.section199AIsSST = null; },
    source => { if (source.original) source.original.charitableCapitalGain30 = 'NaN'; },
    source => { if (source.original) source.original.foreignTaxPaid = '1'; },
    source => { if (source.original) source.original.foreignTaxPaid = ''; },
    source => { if (source.original?.priorSuspendedLosses) source.original.priorSuspendedLosses.ordinary = ''; },
    source => { if (source.original) source.original.isPassiveActivity = true; },
    source => { if (source.basis) source.basis.priorBasisSuspensions = undefined; },
    source => { if (source.basis) source.basis.recipientTaxpayerIdLast4 = '4444'; },
    source => { if (source.atRisk?.priorLossHistory) source.atRisk.priorLossHistory.vintages = undefined; },
    source => { if (source.atRisk?.priorLossHistory) source.atRisk.priorLossHistory.sourceTaxYear = '2025'; },
    source => { if (source.atRisk) source.atRisk.currentYearIncreases = '0.01'; },
    source => { source.sameRegularAmtTreatmentConfirmed = false; },
    source => { if (source.receipts?.[0]) source.receipts[0].qualifiedOrganization = false; },
  ];
  for (const change of changes) {
    const state = guidedK1CharityState(), source = state.sectionData.deductions?.k1CharitableSources?.statements?.[0];
    if (!source) throw new Error('Missing fictional original'); change(source); const before = JSON.stringify(state);
    expect(buildTaxInputFromGuidedData(state)).toBeNull();
    expect(validateSection(state, 'deductions').status).not.toBe('complete');
    expect(JSON.stringify(state)).toBe(before);
  }
  const large = guidedK1CharityState(), original = large.sectionData.deductions?.k1CharitableSources?.statements?.[0].original;
  if (!original) throw new Error('Missing fictional original'); original.federalIncomeTaxWithheld = '9007199254740993.01';
  expect(buildGuidedK1CharitableSources(large)?.scheduleK1[0].federalIncomeTaxWithheld).toBe('9007199254740993.01');
});

it('links charity to an actual QBI statement without copying or overriding the activity', () => {
  const state = guidedK1CharityState(), { charity, qualifiedLoss: data } = actualGuidedLinkedK1Charity(), q = data.activities?.[0], s = charity.statements?.[0];
  if (!q || !s?.original || !state.sectionData.deductions) throw new Error('Missing fictional sources');
  state.sectionData.deductions.k1CharitableSources = charity;
  state.sectionData.adjustments = { k1LossSources: data };
  state.segmentation.lifeEvents.push('k1-loss-sources');
  const before = JSON.stringify(state), input = buildTaxInputFromGuidedData(state);
  expect(input?.scheduleK1).toHaveLength(1);
  expect(input?.k1CharitableSources?.statements?.[0].k1SourceId).toBe('scheduleK1:0');
  expect(input?.qbiLossSources?.activities?.[0].k1SourceId).toBe('scheduleK1:0');
  const result = calculateFederalTax(TaxYearInputSchema.parse(input));
  expect(result.agi.toFixed()).toBe('95000'); expect(result.scheduleA?.cashCharitable.toFixed()).toBe('5000');
  expect(result.carryforwards.qbiLossCarryforward.toFixed()).toBe('5000');
  expect(result.scheduleE?.partnerships[0].basisResult?.suspendedLossCarryforward.charitable.toFixed()).toBe('5000');
  expect(JSON.stringify(state)).toBe(before);
  q.allOtherAmountsZeroConfirmed = true; expect(buildTaxInputFromGuidedData(state)).toBeNull();
  q.allOtherAmountsZeroConfirmed = false; s.original.partnershipEIN = '22-2222222'; expect(buildTaxInputFromGuidedData(state)).toBeNull();
  s.original.partnershipEIN = q.entityEIN; s.link = 'independent'; expect(buildTaxInputFromGuidedData(state)).toBeNull();
});

it('preserves prior basis origins and unsupported source methods', () => {
  const state = guidedK1CharityState(), s = state.sectionData.deductions?.k1CharitableSources?.statements?.[0];
  if (!s?.original?.priorSuspendedLosses || !s.basis?.currentContributions?.[0] || !s.receipts?.[0]) throw new Error('Missing fictional source');
  Object.assign(s.original, { beginningBasis: '20', charitableCash: '20', charitableCapitalGain30: '0' }); s.original.priorSuspendedLosses.charitable = '20';
  Object.assign(s.basis.currentContributions[0], { category: 'cash_60', contributionShare: '20', adjustedBasisShare: '20' }); s.receipts[0].originalCode = 'A';
  s.basis.priorBasisSuspensions = [{ sourceId: 'original-2018-stock', originTaxYear: '2018', category: 'capital_gain_30', contributionShare: '150', adjustedBasisShare: '50',
    appreciationPreviouslyTakenIntoAccount: '100', sourceReference: 'Fictional complete original basis records',
    basisUseHistory: Array.from({ length: 7 }, (_, i) => ({ taxYear: String(2018 + i), basisAllowed: i === 0 ? '30' : '0' })) }];
  s.receipts.push({ basisSourceId: 'original-2018-stock', originalBox: '13', originalCode: 'E', recipientName: 'Fictional original recipient', recipientCategory: 'fifty-percent', qualifiedOrganization: true,
    sourceReference: 'Fictional original2018 receipt', contributionDate: '2018-06-01', propertyType: 'appreciated_stock', acquisitionDate: '2016-01-01', fairMarketValueShare: '150' });
  const input = buildTaxInputFromGuidedData(state), result = calculateFederalTax(TaxYearInputSchema.parse(input));
  expect(result.scheduleA?.cashCharitable.toFixed()).toBe('10'); expect(result.scheduleA?.nonCashCharitable.toFixed()).toBe('10');
  expect(result.carryforwards.charitableContributions.toFixed()).toBe('0');
  expect(result.scheduleE?.partnerships[0].basisResult?.charitableSources?.appreciationExempt.toFixed()).toBe('0');
  const historical2026 = structuredClone(state), later = historical2026.sectionData.deductions?.k1CharitableSources?.statements?.[0];
  const historicalPacket = historical2026.sectionData.deductions?.k1CharitableSources;
  if (!historicalPacket || !later?.original || !later.basis?.currentContributions?.[0] || !later.basis.priorBasisSuspensions?.[0].basisUseHistory || !later.receipts?.[0] || !later.atRisk?.priorLossHistory) throw new Error('Missing historical sources');
  historical2026.taxYear = 2026; historicalPacket.sourceTaxYear = '2026';
  later.original.taxYear = '2026'; Object.assign(later.basis, { sourceTaxYear: '2026', statementYearStart: '2026-01-01', statementYearEnd: '2026-12-31' });
  later.basis.currentContributions[0].contributionDate = '2026-06-01'; later.receipts[0].contributionDate = '2026-06-01';
  later.basis.priorBasisSuspensions[0].basisUseHistory.push({ taxYear: '2025', basisAllowed: '0' });
  later.atRisk.sourceTaxYear = '2026'; later.atRisk.priorLossHistory.sourceTaxYear = '2025';
  expect(() => buildGuidedK1CharitableSources(historical2026)).toThrow(/prior-basis release in2026/);
  s.basis.priorBasisSuspensions[0].basisUseHistory?.pop(); expect(buildTaxInputFromGuidedData(state)).toBeNull();
  const excess = guidedK1CharityState(), original = excess.sectionData.deductions?.k1CharitableSources?.statements?.[0].original;
  if (!original) throw new Error('Missing fictional original'); original.distributions = '30.01';
  expect(buildTaxInputFromGuidedData(excess)).toBeNull(); expect(original.distributions).toBe('30.01');
});

it('invalidates changed charitable and linked source confirmations', () => {
  const state = guidedK1CharityState(), data = state.sectionData.deductions?.k1CharitableSources;
  if (!data?.statements?.[0].basis) throw new Error('Missing fictional packet');
  state.sectionData.adjustments = { k1LossSources: actualGuidedK1Sources() };
  const changed = structuredClone(data), changedBasis = changed.statements?.[0].basis, deductions = state.sectionData.deductions;
  if (!changedBasis || !deductions) throw new Error('Missing fictional source'); changedBasis.recipientName = 'Different taxpayer';
  const next = updateSectionData(state, 'deductions', { ...deductions, k1CharitableSources: changed });
  expect(next.sectionData.deductions?.k1CharitableSources?.sourceFactsConfirmed).toBeNull();
  expect(next.sectionData.deductions?.k1CharitableSources?.statements?.[0].atRisk?.priorLossHistory?.sourceFactsConfirmed).toBeNull();
  expect(next.sectionData.adjustments?.k1LossSources?.sourceFactsConfirmed).toBeNull();
  const confirmed = updateK1CharitableSources(data, { sourceFactsConfirmed: true });
  expect(confirmed.statements?.[0].basis?.sourceFactsConfirmed).toBe(true);
  expect(updateK1CharitableSources(data, { statements: [{ ...data.statements[0], sameRegularAmtTreatmentConfirmed: false }] }).sourceFactsConfirmed).toBeNull();
  const unknown = guidedK1CharityState();
  if (!unknown.sectionData.deductions) throw new Error('Missing fictional deductions');
  unknown.sectionData.deductions.k1CharitableSources = { ...data, statements: undefined };
  expect(buildTaxInputFromGuidedData(unknown)).toBeNull();
  unknown.sectionData.deductions.k1CharitableSources.statements = [];
  expect(buildTaxInputFromGuidedData(unknown)?.scheduleK1).toEqual([]);
});
