// Spec: spec/federal/form-8962-married-third-family.yaml. Synthetic source originals.
import { expect, it, vi } from 'vitest';
import { calculateForm8962SharedPolicy } from '@/engine/forms/form-8962-shared-policy.js';
import { calculateFederalTax } from '@/engine/federal.js';
import { TaxYearInputSchema } from '@/models/inputs.js';
import { marriedThirdFamilyFixture } from '../../fixtures/married-third-family-policy.js';
import { calculateVerifiedAiAudit, resolveServerAiTaxContext } from '@/lib/ai-tax-context';
import { createWorkspaceRecord } from '@/lib/workspace-storage';
import { sanitizeWorkspaceForHostedStorage } from '@/lib/hosted-privacy';
import { buildProviderWorkspaceRequest } from '@/lib/provider-workspace-request';

vi.mock('server-only', () => ({}));

function present<T,>(value: T | null | undefined): T {
  if (value == null) throw new Error('Expected synthetic source or result');
  return value;
}

it('uses the published Worksheet E printed fraction and actual advance credit', () => {
  const result = calculateForm8962SharedPolicy(marriedThirdFamilyFixture());
  expect(result.periods.map(row => [row.firstMonth, row.lastMonth, row.fraction.toFixed(2)])).toEqual([[1, 12, '0.17']]);
  expect(result.months.map(row => [row.premium.toFixed(), row.slcsp.toFixed(), row.advance.toFixed()])).toEqual(Array.from({ length: 12 }, () => ['0', '0', '34']));
  expect(result.lines.filter(row => row.line.startsWith('allocation-')).map(row => row.line)).toEqual(['allocation-1g']);
  expect(result.lines.find(row => row.line === 'worksheet-e:month-1:4')?.value.toFixed(2)).toBe('0.17');
});
it('reconciles original monthly advance credit once without a premium tax credit', () => {
  const input = marriedThirdFamilyFixture(), before = JSON.stringify(input), result = present(calculateFederalTax(input).form8962);
  expect(result.ptcAllowed.toFixed()).toBe('0');
  expect(result.advancePTCTotal.toFixed()).toBe('408');
  expect(result.excessAPTC.toFixed()).toBe('408');
  expect(result.excessAPTCRepayment.toFixed()).toBe('408');
  expect(JSON.stringify(input)).toBe(before);
});
it('rejects incomplete or conflicting original family and agreement sources', () => {
  const cases: Array<(input: ReturnType<typeof marriedThirdFamilyFixture>) => void> = [
    input => { input.form8962.sharedPolicyAllocations.marriedThirdFamily.sourceFactsConfirmed = false; },
    input => { input.form8962.sharedPolicyAllocations.marriedThirdFamily.sourceTaxYear = 2024; },
    input => { present(input.form8962.sharedPolicyAllocations.marriedThirdFamily.families[2]).sourceReference = ''; },
    input => { present(input.form8962.sharedPolicyAllocations.marriedThirdFamily.families[0]).filingStatus = 'head_of_household'; },
    input => { present(input.form8962.sharedPolicyAllocations.marriedThirdFamily.families[1]).taxpayerSsn = '999-99-9999'; },
    input => { present(input.form8962.sharedPolicyAllocations.marriedThirdFamily.families[2]).dependents.pop(); },
    input => { input.form8962.sharedPolicyAllocations.marriedThirdFamily.coverageFamilyAssignments.pop(); },
    input => { present(input.form8962.sharedPolicyAllocations.marriedThirdFamily.monthlySources[0]).primaryAgreementConfirmed = false; },
    input => { present(input.form8962.sharedPolicyAllocations.marriedThirdFamily.monthlySources[0]).primaryAgreementSourceReference = ''; },
    input => { present(input.form8962.sharedPolicyAllocations.marriedThirdFamily.monthlySources[0]).primaryAgreementFraction = '1.01'; },
    input => { present(input.form8962.sharedPolicyAllocations.marriedThirdFamily.monthlySources[0]).primaryAgreementFraction = '.5'; },
    input => { present(input.form8962.sharedPolicyAllocations.marriedThirdFamily.monthlySources[0]).primaryBenchmark = ''; },
    input => { present(present(present(input.form8962.sharedPolicyAllocations.policies[0]).original).monthlyPremiums?.[0]).advancePremiumTaxCredit = '201'; },
    input => { present(input.form1095A[0]).monthlyPremiums.shift(); present(input.form8962.sharedPolicyAllocations.policies[0]).original = structuredClone(input.form1095A[0]); input.form8962.sharedPolicyAllocations.marriedThirdFamily.monthlySources.shift(); },
    input => { Object.assign(input.form8962.sharedPolicyAllocations.marriedThirdFamily, { calculatedAdvance: '34' }); },
  ];
  for (const mutate of cases) { const input = marriedThirdFamilyFixture(); mutate(input); expect(() => calculateForm8962SharedPolicy(input)).toThrow(); }
  for (const field of ['sourceTaxYear', 'sourceReference', 'sourceFactsConfirmed', 'noOtherAllocationsRequiredConfirmed',
    'allAgreementsAndCoverageMonthsIncludedConfirmed', 'families', 'coverageFamilyAssignments', 'monthlySources']) {
    const input = marriedThirdFamilyFixture(); Reflect.deleteProperty(input.form8962.sharedPolicyAllocations.marriedThirdFamily, field);
    expect(() => calculateForm8962SharedPolicy(input)).toThrow();
  }
  for (const field of ['role', 'sourceTaxYear', 'sourceReference', 'filingStatus', 'taxpayerName', 'taxpayerSsn', 'dependents', 'allTaxFamilyMembersIncludedConfirmed']) {
    const input = marriedThirdFamilyFixture(); Reflect.deleteProperty(present(input.form8962.sharedPolicyAllocations.marriedThirdFamily.families[2]), field);
    expect(() => calculateForm8962SharedPolicy(input)).toThrow();
  }
  for (const field of ['month', 'primaryBenchmark', 'spouseBenchmark', 'primaryBenchmarkSourceReference', 'spouseBenchmarkSourceReference',
    'primaryAgreementFraction', 'spouseAgreementFraction', 'primaryAgreementSourceReference', 'spouseAgreementSourceReference', 'primaryAgreementConfirmed', 'spouseAgreementConfirmed']) {
    const input = marriedThirdFamilyFixture(); Reflect.deleteProperty(present(input.form8962.sharedPolicyAllocations.marriedThirdFamily.monthlySources[0]), field);
    expect(() => calculateForm8962SharedPolicy(input)).toThrow();
  }
});
it('preserves known zero and complete replay while rejecting other methods', () => {
  const input = marriedThirdFamilyFixture();
  present(input.form8962.sharedPolicyAllocations.marriedThirdFamily.monthlySources[0]).primaryAgreementFraction = '0';
  present(input.form8962.sharedPolicyAllocations.marriedThirdFamily.monthlySources[1]).primaryAgreementFraction = '1';
  const replay = TaxYearInputSchema.parse(JSON.parse(JSON.stringify(input))), result = calculateForm8962SharedPolicy(replay);
  expect(result.months.slice(0, 3).map(row => row.advance.toFixed())).toEqual(['100', '0', '34']);
  const nextYear = marriedThirdFamilyFixture(2026);
  expect(calculateForm8962SharedPolicy(nextYear).months.map(row => row.advance.toFixed())).toEqual(Array.from({ length: 12 }, () => '34'));
  const reordered = marriedThirdFamilyFixture();
  reordered.form8962.sharedPolicyAllocations.marriedThirdFamily.families.reverse();
  reordered.form8962.sharedPolicyAllocations.marriedThirdFamily.coverageFamilyAssignments.reverse();
  reordered.form8962.sharedPolicyAllocations.marriedThirdFamily.monthlySources.reverse();
  expect(calculateForm8962SharedPolicy(reordered).months.map(row => row.advance.toFixed())).toEqual(Array.from({ length: 12 }, () => '34'));
  for (const mutate of [
    (value: typeof input) => { value.form8962.marriedFilingSeparatelyExceptionConfirmed = true; },
    (value: typeof input) => { value.taxpayer.filingStatus = 'married_filing_jointly'; },
    (value: typeof input) => { value.form8962.sharedPolicyAllocations.policies.push(structuredClone(present(value.form8962.sharedPolicyAllocations.policies[0]))); },
    (value: typeof input) => { value.form8962.sharedPolicyAllocations.marriedThirdFamily.monthlySources.pop(); },
  ]) { const other = marriedThirdFamilyFixture(); mutate(other); expect(() => calculateForm8962SharedPolicy(other)).toThrow(); }
});
it('keeps third-family originals outside actual verified explanation and hosted metadata', () => {
  const input = marriedThirdFamilyFixture(), before = JSON.stringify(input);
  const scope = { ownerScope: 'synthetic-ptc-owner', workspaceId: 'synthetic-ptc-return', workspaceRevision: 'synthetic-ptc-revision' };
  const audit = calculateVerifiedAiAudit(scope, input), context = resolveServerAiTaxContext({ ...scope, taxYear: 2025, audit });
  expect(context.status).toBe('available');
  const workspace = Object.assign(createWorkspaceRecord(scope.workspaceId, { now: '2026-11-14T00:00:00.000Z' }),
    { form8962: input.form8962, form1095A: input.form1095A });
  const originals = input.form8962.sharedPolicyAllocations.marriedThirdFamily;
  const markers = ['marriedThirdFamily', 'monthlySources', 'coverageFamilyAssignments', originals.sourceReference,
    ...originals.families.flatMap(family => [family.sourceReference, family.taxpayerSsn, family.taxpayerSsn.replace(/-/g, ''), family.taxpayerName]),
    ...originals.monthlySources.flatMap(row => [row.primaryAgreementSourceReference, row.spouseAgreementSourceReference, row.primaryBenchmarkSourceReference, row.spouseBenchmarkSourceReference])];
  for (const payload of [audit, context, sanitizeWorkspaceForHostedStorage(workspace), buildProviderWorkspaceRequest(workspace, { now: '2026-11-14T00:00:00.000Z' })])
    for (const marker of markers) expect(JSON.stringify(payload)).not.toContain(marker);
  expect(JSON.stringify(input)).toBe(before);
});
