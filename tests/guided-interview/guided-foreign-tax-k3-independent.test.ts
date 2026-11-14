// Spec: spec/federal/foreign-tax-direct-credit.yaml — guided-portfolio-k3 and guided-portfolio-k3-continuity.
import { describe, expect, it } from 'vitest';
import { buildGuidedFactAnswers, buildGuidedSyntheticDocuments, buildTaxInputFromGuidedData } from '@/lib/guided-interview-bridge';
import { loadGuidedFlowState, saveGuidedFlowState, setInterviewTaxYear, updateSectionData, validateSection } from '@/lib/guided-interview-flow';
import { createWorkspaceRecord, syncGuidedFlowToWorkspace } from '@/lib/workspace-storage';
import { sanitizeWorkspaceForHostedStorage } from '@/lib/hosted-privacy';
import { hostedGuidedDraftId } from '@/lib/hosted-workspace-browser-state';
import { buildProviderWorkspaceRequest } from '@/lib/provider-workspace-request';
import { resolveForeignTaxDirectSources } from '@/engine/forms/foreign-tax-direct-sources';
import { calculatePartnerBasisSchedule } from '@/engine/forms/partner-basis-schedule';
import { d } from '@/utils/decimal';
import { guidedForeignTaxK3Fixture } from '../fixtures/guided-foreign-tax-k3';

type Fixture = ReturnType<typeof guidedForeignTaxK3Fixture>;
function required<T>(value: T | undefined): T {
  if (value === undefined) throw new Error('Explicit fictional source missing');
  return value;
}
function annualSources(fixture: Fixture) {
  const rows = fixture.facts.sources;
  if (!rows) throw new Error('Explicit fictional source rows missing');
  return rows;
}
function tax(fixture: Fixture, value: string) {
  fixture.k3.foreignTaxPaid = value;
  const row = annualSources(fixture)[1];
  if (!row) throw new Error('Explicit fictional K3 source missing');
  row.reportedTaxAmount = value;
}
function admitted(fixture: Fixture) {
  const result = buildTaxInputFromGuidedData(fixture.state);
  expect(result).not.toBeNull();
  if (!result) throw new Error('Complete actual fictional K3 facts must reach the canonical return');
  return result;
}
function rejected(fixture: Fixture) {
  expect(validateSection(fixture.state, 'other-taxes').status).not.toBe('complete');
  expect(buildTaxInputFromGuidedData(fixture.state)).toBeNull();
}
function addSecond(fixture: Fixture, amount = '49.75') {
  const second = { ...fixture.k3, partnershipName: 'Second Fictional Portfolio LP', partnershipEIN: '98-7654321',
    originalK1Reference: 'Second actual fictional K1', qualifiedK3Reference: 'Second actual fictional K3', foreignTaxPaid: amount };
  // This collector data remains untrusted; the production bridge must validate it.
  const annual = fixture.facts as typeof fixture.facts & { qualifiedK3Statements: Array<typeof fixture.k3> };
  annual.qualifiedK3Statements.push(second);
  const original = annualSources(fixture)[1];
  if (!original) throw new Error('Explicit fictional K3 source missing');
  annualSources(fixture).push({ ...original, sourceId: 'scheduleK1:1', payerName: second.partnershipName,
    payerTin: second.partnershipEIN, reportedTaxAmount: amount, sourceReference: second.qualifiedK3Reference });
  return second;
}

describe('independent guided qualified portfolio K3 boundary', () => {
  it.each([2025, 2026])('binds actual portfolio amounts and qualified tax once in %i', year => {
    const fixture = guidedForeignTaxK3Fixture(year);
    expect(validateSection(fixture.state, 'other-taxes').status).toBe('complete');
    const input = admitted(fixture);
    expect(input.scheduleK1).toHaveLength(1);
    expect(input.scheduleK1[0]).toMatchObject({ taxYear: year, accountHolder: 'primary', foreignTaxCategory: 'passive' });
    for (const [field, amount] of [['ordinaryIncome', '0'], ['interestIncome', '100'], ['ordinaryDividends', '40'],
      ['qualifiedDividends', '20'], ['foreignSourceIncome', '140'], ['foreignTaxPaid', '50']] as const) {
      expect(d(required(input.scheduleK1[0])[field]).eq(amount), field).toBe(true);
    }
    expect(resolveForeignTaxDirectSources(input).currentTaxExact.toFixed()).toBe('250.25');
    const basis = calculatePartnerBasisSchedule(required(input.scheduleK1[0]));
    expect(basis.lossCategories.find(row => row.key === 'foreignTax')?.allowed.toFixed()).toBe('50');
    expect(basis.totalSuspendedLosses.toFixed()).toBe('0');
    expect(input.foreignTaxElection).not.toHaveProperty('qualifiedK3Statements');
  });

  it.each([
    ['sourceTaxYear', '2024'], ['entityType', 's_corporation'], ['qualifiedStatementKind', undefined],
    ['qualifiedStatementKind', 'schedule_k1_1065'], ['foreignTaxCategory', 'general'], ['accountHolder', 'spouse'],
    ['recipientName', 'Different Fictional Person'], ['recipientTaxpayerIdLast4', '4444'],
    ['partnershipEIN', ''], ['partnershipName', ''], ['originalK1Reference', ''], ['qualifiedK3Reference', ''],
    ['beginningBasisSourceReference', ''], ['foreignCountry', ''], ['foreignCountry', 'Puerto Rico'],
    ['foreignCountry', 'US'], ['foreignSourceIncome', '139.99'], ['foreignSourceIncome', '140.01'],
    ['qualifiedDividends', '40.01'], ['foreignTaxPaid', ''], ['foreignSourceIncome', undefined],
    ['beginningBasis', undefined], ['interestIncome', '-0.01'], ['ordinaryDividends', undefined],
  ])('rejects missing, conflicting or unsupported original %s=%s', (field, value) => {
    const fixture = guidedForeignTaxK3Fixture();
    Object.assign(fixture.k3, { [field]: value });
    rejected(fixture);
  });

  for (const field of ['domesticContinuingNonPtpConfirmed', 'portfolioIncomeOnlyConfirmed', 'allOtherK1AmountsZeroConfirmed',
    'noOtherBasisChangesConfirmed', 'priorBasisSuspensionsZeroConfirmed', 'priorAtRiskSuspensionsZeroConfirmed',
    'priorPassiveSuspensionsZeroConfirmed', 'sourceFactsConfirmed']) {
    it.each([undefined, null, false])(`requires actual ${field} rather than %s`, value => {
      const fixture = guidedForeignTaxK3Fixture();
      Object.assign(fixture.k3, { [field]: value });
      rejected(fixture);
    });
  }

  it.each(['distributions', 'netShortTermCapitalGain', 'otherDeductions', 'foreignTaxCarryforward', 'amtOtherItems', 'selfEmploymentEarnings'])('rejects an unsupported saved %s instead of stripping it', field => {
    const fixture = guidedForeignTaxK3Fixture();
    Object.assign(fixture.k3, { [field]: '1' });
    rejected(fixture);
  });

  it.each([
    ['foreignCountry', 'France'], ['qualifiedPayeeStatement', undefined], ['qualifiedPayeeStatement', 'schedule_k1_1041'],
    ['payerName', 'Different Fictional Entity'], ['payerTin', '98-7654321'], ['owner', 'spouse'],
    ['reportedTaxAmount', '49.99'], ['sourceReference', 'Different fictional K3 reference'],
  ])('binds the annual %s to the actual qualified original', (field, value) => {
    const fixture = guidedForeignTaxK3Fixture();
    admitted(fixture);
    Object.assign(required(annualSources(fixture)[1]), { [field]: value });
    rejected(fixture);
  });

  it('requires exact full foreign-tax basis allowance even for a one-cent shortfall', () => {
    const fixture = guidedForeignTaxK3Fixture();
    Object.assign(fixture.k3, { beginningBasis: '0', interestIncome: '20', ordinaryDividends: '20', qualifiedDividends: '0', foreignSourceIncome: '40' });
    tax(fixture, '40');
    expect(calculatePartnerBasisSchedule(required(admitted(fixture).scheduleK1[0])).totalSuspendedLosses.toFixed()).toBe('0');
    tax(fixture, '40.01');
    rejected(fixture);
  });

  it('preserves explicit zero tax on foreign income but still requires its qualified source row', () => {
    const fixture = guidedForeignTaxK3Fixture();
    tax(fixture, '0');
    expect(resolveForeignTaxDirectSources(admitted(fixture)).currentTaxExact.toFixed()).toBe('200.25');
    annualSources(fixture).splice(1, 1);
    rejected(fixture);
  });

  it('applies the exact combined threshold to all 1099 and K3 sources before rounding', () => {
    const fixture = guidedForeignTaxK3Fixture();
    addSecond(fixture);
    const input = admitted(fixture);
    expect(input.scheduleK1).toHaveLength(2);
    expect(resolveForeignTaxDirectSources(input).currentTaxExact.toFixed()).toBe('300');
    const annual = fixture.facts as typeof fixture.facts & { qualifiedK3Statements: Array<typeof fixture.k3> };
    required(annual.qualifiedK3Statements[1]).foreignTaxPaid = '49.751';
    required(annualSources(fixture)[2]).reportedTaxAmount = '49.751';
    rejected(fixture);
  });

  it('reserves the600 threshold for an actual joint return and includes both taxpayer status records', () => {
    const fixture = guidedForeignTaxK3Fixture();
    fixture.state.segmentation.filingStatus = 'mfj';
    const direct = fixture.facts.creditWithoutForm1116;
    if (!direct) throw new Error('Explicit fictional eligibility missing');
    direct.taxpayers?.push({ owner: 'spouse', status: 'us_citizen', sourceReference: 'Actual fictional spouse status' });
    Object.assign(fixture.k3, { beginningBasis: '1000', interestIncome: '1000', foreignSourceIncome: '1040' });
    tax(fixture, '399.75');
    expect(resolveForeignTaxDirectSources(admitted(fixture)).currentTaxExact.toFixed()).toBe('600');
    tax(fixture, '399.751');
    rejected(fixture);
    tax(fixture, '399.75');
    direct.taxpayers?.pop();
    rejected(fixture);
    fixture.state.segmentation.filingStatus = 'mfs';
    rejected(fixture);
  });

  it('rejects stale positional source rows after reordering or removing actual K3 statements', () => {
    const fixture = guidedForeignTaxK3Fixture();
    addSecond(fixture);
    expect(admitted(fixture).scheduleK1).toHaveLength(2);
    const annual = fixture.facts as typeof fixture.facts & { qualifiedK3Statements: Array<typeof fixture.k3> };
    annual.qualifiedK3Statements.reverse();
    rejected(fixture);
    annual.qualifiedK3Statements.reverse();
    annual.qualifiedK3Statements.shift();
    rejected(fixture);
  });

  it('revokes the annual election after source edits and rejects a stale source year', () => {
    const fixture = guidedForeignTaxK3Fixture();
    admitted(fixture);
    const other = fixture.state.sectionData['other-taxes'];
    if (!other) throw new Error('Explicit fictional annual election missing');
    const facts = structuredClone(fixture.facts) as typeof fixture.facts & { qualifiedK3Statements: Array<typeof fixture.k3> };
    required(facts.qualifiedK3Statements[0]).partnershipName = 'Edited Fictional Entity';
    const changed = updateSectionData(fixture.state, 'other-taxes', { ...other, foreignTaxElection: facts });
    expect(changed.sectionData['other-taxes']?.foreignTaxElection?.sourceFactsConfirmed).toBeNull();
    expect(changed.sectionData['other-taxes']?.foreignTaxElection?.creditWithoutForm1116?.sourceFactsConfirmed).toBeNull();
    expect(buildTaxInputFromGuidedData(changed)).toBeNull();
    expect(buildTaxInputFromGuidedData(setInterviewTaxYear(fixture.state, 2026))).toBeNull();
  });

  it('keeps new nested K3 originals in the owner-scoped private draft, outside hosted metadata and provider context', () => {
    const fixture = guidedForeignTaxK3Fixture(), before = JSON.stringify(fixture.state);
    admitted(fixture);
    const workspace = syncGuidedFlowToWorkspace(createWorkspaceRecord('opaque-k3-independent', { now: '2026-11-14T00:00:00.000Z' }),
      buildGuidedSyntheticDocuments(fixture.state), buildGuidedFactAnswers(fixture.state), fixture.state);
    const localWithFuturePrivateFields = Object.assign(workspace, { qualifiedK3Statements: [fixture.k3], guidedFlowState: fixture.state });
    const shell = sanitizeWorkspaceForHostedStorage(localWithFuturePrivateFields);
    const provider = buildProviderWorkspaceRequest(localWithFuturePrivateFields, { now: '2026-11-14T00:00:00.000Z' });
    for (const payload of [JSON.stringify(shell), JSON.stringify(provider)]) {
      for (const marker of ['qualifiedK3Statements', 'guidedFlowState', fixture.k3.partnershipName, fixture.k3.partnershipEIN,
        fixture.k3.recipientTaxpayerIdLast4, fixture.k3.originalK1Reference, fixture.k3.qualifiedK3Reference, fixture.k3.beginningBasisSourceReference]) {
        expect(payload).not.toContain(marker);
      }
    }
    const values = new Map<string, string>();
    const storage: Storage = { get length() { return values.size; }, clear: () => values.clear(),
      getItem: key => values.get(key) ?? null, key: index => [...values.keys()][index] ?? null,
      removeItem: key => { values.delete(key); }, setItem: (key, value) => { values.set(key, value); } };
    const revision = '8a72cff2-72ee-4636-997e-238b53b972da';
    const own = hostedGuidedDraftId('hosted-owner:fictional-a', workspace.id, revision);
    saveGuidedFlowState(storage, own, fixture.state);
    expect(loadGuidedFlowState(storage, own)?.sectionData['other-taxes']?.foreignTaxElection?.qualifiedK3Statements).toEqual([fixture.k3]);
    expect(loadGuidedFlowState(storage, hostedGuidedDraftId('hosted-owner:fictional-b', workspace.id, revision))).toBeNull();
    expect(loadGuidedFlowState(storage, hostedGuidedDraftId('hosted-owner:fictional-a', workspace.id, '3c2fa677-6af1-47af-9f96-9fc63d9f0353'))).toBeNull();
    expect(JSON.stringify(fixture.state)).toBe(before);
  });

  it.each(['k1LossSources', 'k1CharitableSources'])('denies mixing the independent collector with a %s packet', key => {
    const fixture = guidedForeignTaxK3Fixture();
    if (key === 'k1LossSources') fixture.state.sectionData.adjustments = { ...fixture.state.sectionData.adjustments, k1LossSources: { activities: [] } };
    else fixture.state.sectionData.deductions = { ...fixture.state.sectionData.deductions, k1CharitableSources: { statements: [] } };
    rejected(fixture);
  });
});
