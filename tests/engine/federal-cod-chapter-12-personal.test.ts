// Spec: spec/federal/cod-title-11-chapter-12-personal.yaml.
import { expect, it, vi } from 'vitest';
// Isolated statutory integration only. Production2026 remains unavailable.
vi.mock('@/models/constants.js', async importOriginal => {
  const original = await importOriginal<typeof import('@/models/constants.js')>();
  const { FEDERAL_2026_CONSTANTS } = await import('@/models/federal-2026-indexed.js');
  return { ...original, getConstants: (year: number) => year === 2026 ? FEDERAL_2026_CONSTANTS : original.getConstants(year) };
});
import { calculateFederalTax } from '@/engine/federal.js';
import { buildForm982ReferenceSummary } from '@/pdf/mappings/2025/fill-form-982.js';
import { actualPartialPersonalCodInput, partialPersonalBasisInput } from '../fixtures/cod-partial-personal.js';

const court = { sourceReference: 'Fictional original chapter12 petition, complete case docket and discharge order: never chapter7 or11',
  sourceFactsConfirmed: true, debtorUnderCourtJurisdictionConfirmed: true,
  dischargeByCourtOrApprovedPlanConfirmed: true, caseNeverChapter7Or11Confirmed: true };
function chapter12(options: Parameters<typeof actualPartialPersonalCodInput>[0] = {}) {
  const input = actualPartialPersonalCodInput({ debt: '18000', interest: '0', eventCode: 'A', ...options });
  Object.assign(input.form982NolSources, { title11Case: true, title11Chapter: '12', title11Source: { ...court } });
  input.codExclusion!.bankruptcy = true;
  return input;
}
function year2026<T>(input: T): T {
  const rewrite = (value: unknown): unknown => Array.isArray(value) ? value.map(rewrite)
    : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).map(([key, item]) => [key, rewrite(item)]))
      : value === 2025 ? 2026 : typeof value === 'string' && value.startsWith('2026-01-01') ? value.replace('2026-', '2027-')
        : typeof value === 'string' && value.startsWith('2025-') ? value.replace('2025-', '2026-') : value;
  return rewrite(input) as T;
}

it('excludes complete original chapter12 personal debt in2025 and2026', () => {
  for (const currentYear of [false, true]) {
    for (const assets of ['80000', '200000']) {
      const original = chapter12({ assets }), input = currentYear ? year2026(original) : original;
      const result = calculateFederalTax(input);
      expect(result.schedule1!.cancelledDebtIncome.toFixed()).toBe('0');
      expect(result.codNolReduction!.sourceExcludedAmount.toFixed()).toBe('18000');
      expect(result.codNolReduction!.reportedExcludedAmount.toFixed()).toBe('18000');
      expect(result.codNolReduction!.title11).toBe(true);
    }
    const original = chapter12({ debt: '18000.49', interest: '1200.25' });
    const result = calculateFederalTax(currentYear ? year2026(original) : original);
    expect(result.codNolReduction!.sourceDischargedAmount.toFixed()).toBe('18000.49');
    expect(result.codNolReduction!.sourceIncludedInterest.toFixed()).toBe('1200.25');
    expect(result.codNolReduction!.sourceExcludedAmount.toFixed()).toBe('18000.49');
    expect(result.codNolReduction!.reportedExcludedAmount.toFixed()).toBe('18000');
    expect(result.schedule1!.cancelledDebtIncome.toFixed()).toBe('0');
  }
});

it('requires original non-estate case history and court facts', () => {
  for (const title11Chapter of ['13', '12']) {
    for (const history of [undefined, false, null]) {
      const input = chapter12();
      Object.assign(input.form982NolSources, { title11Chapter,
        title11Source: { ...court, caseNeverChapter7Or11Confirmed: history } });
      expect(() => calculateFederalTax(input), `${title11Chapter}:${history}`).toThrow(/case history/);
    }
  }
  for (const chapter of ['7', '11', undefined]) {
    const input = chapter12(); Object.assign(input.form982NolSources, { title11Chapter: chapter });
    expect(() => calculateFederalTax(input)).toThrow(/separate bankruptcy estate method/);
  }
  for (const key of ['sourceFactsConfirmed', 'debtorUnderCourtJurisdictionConfirmed', 'dischargeByCourtOrApprovedPlanConfirmed']) {
    const input = chapter12(); Object.assign(input.form982NolSources!.title11Source!, { [key]: undefined });
    expect(() => calculateFederalTax(input), key).toThrow(/court record/);
  }
});

it('rejects explicitly converted chapter13 histories', () => {
  const input = chapter12();
  Object.assign(input.form982NolSources, { title11Chapter: '13',
    title11Source: { ...court, caseNeverChapter7Or11Confirmed: false } });
  expect(() => calculateFederalTax(input)).toThrow(/case history/);
});

it('preserves ordinary reductions exempt property and line1a review', () => {
  for (const exempt of [false, true]) {
    const original = partialPersonalBasisInput(), input = chapter12();
    input.form982NolSources.insolvency!.assets = original.form982NolSources.insolvency!.assets;
    input.form982AttributeSources = original.form982AttributeSources;
    for (const ledger of [input.form982AttributeSources.regular, input.form982AttributeSources.alternativeTax]) {
      Object.assign(ledger.property.followingYear.properties[0]!, { exemptUnderSection522: exempt });
    }
    const result = calculateFederalTax(input);
    for (const ledger of [result.codAttributeReduction!.regular, result.codAttributeReduction!.alternativeTax]) {
      expect(ledger.property.immediatelyAfterLiabilities.toFixed()).toBe('72000');
      expect(ledger.property.attributeReduction.toFixed()).toBe(exempt ? '0' : '3000');
      expect(ledger.property.remainingBasis.toFixed()).toBe(exempt ? '75000' : '72000');
      expect(ledger.unreducedExclusion.toFixed()).toBe(exempt ? '18000' : '15000');
    }
    const summary = buildForm982ReferenceSummary(result);
    expect(summary.exclusions).toEqual([{ line: '1a', description: 'Title 11 exclusion', value: '18000' }]);
    expect(summary.title).toContain('Title 11');
    expect(JSON.stringify(summary)).not.toContain('Insolvency exclusion');
  }
});

it('retains original nonbusiness debt and property exclusions', () => {
  for (const proceedsUse of ['business', 'investment', 'mixed_or_other'] as const) {
    const input = chapter12(); input.form982NolSources.debts[0]!.personalDebt!.proceedsUse = proceedsUse;
    expect(() => calculateFederalTax(input)).toThrow(/personal borrowing/);
  }
  for (const patch of [{ unsecuredPersonalDebtConfirmed: false }, { noPropertyTransferConfirmed: false },
    { fmvOfProperty: '1' }, { identifiableEventCode: 'G' }]) {
    const input = chapter12(); Object.assign(input.form982NolSources.debts[0]!, patch);
    expect(() => calculateFederalTax(input)).toThrow();
  }
  const deductible = chapter12(); deductible.form982NolSources.debts[0]!.personalDebt!.interestTreatment = 'potentially_deductible';
  expect(() => calculateFederalTax(deductible)).toThrow(/personal borrowing/);
  const farm = chapter12(); farm.codExclusion!.qualifiedFarmExclusion = '1';
  expect(() => calculateFederalTax(farm)).toThrow(/no conflicting legacy election/);
});
