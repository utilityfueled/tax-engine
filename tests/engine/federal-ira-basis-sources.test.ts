// Specs: spec/federal/ira-basis-sources.yaml canonical-return; spec/federal/form-8606.yaml 2026 ordinary basis precision.
import { describe, expect, it, vi } from 'vitest';
import { calculateFederalTax } from '@/engine/federal.js';
import { TaxYearInputSchema } from '@/models/inputs.js';
import * as constants from '@/models/constants.js';
import { FEDERAL_2026_CONSTANTS } from '@/models/federal-2026-indexed.js';
import { FORM_8606_2026_CANDIDATE, projectForm86062026OrdinaryDistribution } from '@/pdf/mappings/2026/form-8606-candidate.js';
import { ordinaryIraBasisFixture } from '../fixtures/ira-basis.js';

function nearFullBasisJointFixture(taxYear: 2025 | 2026, basis = '9999', gross = '10000') {
  const input = ordinaryIraBasisFixture();
  input.taxpayer.taxYear = taxYear;
  input.iraBasisSources.taxYear = taxYear;
  input.w2s = input.w2s.map(w2 => ({ ...w2, taxYear, accountHolder: 'primary' }));
  for (const form of input.form1099R) {
    form.taxYear = taxYear;
    if (taxYear === 2026) {
      form.trumpAccount = false;
      form.excessContributionEarnings = '0';
    }
  }
  for (const source of input.iraBasisSources.distributions) source.taxYear = taxYear;
  for (const owner of input.iraBasisSources.owners) {
    owner.basisHistory.taxYear = taxYear - 1;
    for (const account of owner.accounts) account.taxYear = taxYear;
  }
  const primary = input.iraBasisSources.owners[0];
  primary.basisHistory.line14 = basis;
  primary.accounts[0].yearEndValue = '0';
  input.form1099R[0].grossDistribution = gross;
  input.iraBasisSources.distributions[0].grossDistribution = gross;
  return input;
}

describe('Original IRA basis sources in the canonical return', () => {
  it('uses actual separate-owner basis to resolve unknown printed taxable amounts', () => {
    const input = TaxYearInputSchema.parse(ordinaryIraBasisFixture());
    const before = structuredClone(input);
    const result = calculateFederalTax(input);
    expect(result.iraDistributionsGross.toFixed()).toBe('3001.49');
    expect(result.iraDistributionsTaxable.toFixed()).toBe('2268');
    expect(result.form8606ByOwner?.primary?.line14.toFixed()).toBe('667');
    expect(result.form8606ByOwner?.spouse?.line14.toFixed()).toBe('1600');
    expect(result.agi.toFixed()).toBe('87268');
    expect(result.allLines.filter(line => line.form === 'IRA basis sources')).toHaveLength(6);
    expect(input).toEqual(before);
    expect(input.form1099R?.[0].taxableAmount).toBeUndefined();
  });

  it('rejects stale or contradictory actual basis before returning authoritative amounts', () => {
    const edits: ((input: ReturnType<typeof ordinaryIraBasisFixture>) => void)[] = [
      input => { input.form1099R[0].grossDistribution = '1002'; },
      input => { input.iraBasisSources.owners[1].identity.ssnLast4 = '9999'; },
      input => { input.iraBasisSources.owners[0].basisHistory.mostRecentFormConfirmed = false; },
      input => { input.iraBasisSources.owners[0].accounts[0].taxYear = 2026; },
      input => { input.iraBasisSources.owners[0].ordinaryFacts.qcdPresent = true; },
    ];
    for (const edit of edits) {
      const input = ordinaryIraBasisFixture(); edit(input);
      expect(() => calculateFederalTax(TaxYearInputSchema.parse(input))).toThrow(/IRA basis/);
    }
  });

  it('retains a separate no-distribution owner carry without pooling it into another owner', () => {
    const input = ordinaryIraBasisFixture();
    input.form1099R.splice(1); input.iraBasisSources.distributions.splice(1);
    const result = calculateFederalTax(TaxYearInputSchema.parse(input));
    expect(result.iraDistributionsTaxable.toFixed()).toBe('668');
    expect(result.form8606ByOwner?.spouse?.line14.toFixed()).toBe('2000');
    expect(result.form8606ByOwner?.primary?.line14.toFixed()).toBe('667');
  });

  it('preserves the public 2026 gate despite complete current-year sources', () => {
    const input = nearFullBasisJointFixture(2026);
    expect(() => calculateFederalTax(TaxYearInputSchema.parse(input))).toThrow(/2026 rule pack .* is incomplete/);
    expect(constants.getRulePack(2026).calculationStatus).toBe('incomplete');
    expect(constants.getRulePack(2026).filingQualified).toBe(false);
  });

  it('transfers the reconciled 2026 ordinary basis without pooling spouses', () => {
    const getConstants = constants.getConstants;
    const isolatedAnnualConstants = vi.spyOn(constants, 'getConstants').mockImplementation(
      year => year === 2026 ? FEDERAL_2026_CONSTANTS : getConstants(year),
    );
    try {
      const input = TaxYearInputSchema.parse(nearFullBasisJointFixture(2026));
      const result = calculateFederalTax(input);
      const primary = result.form8606ByOwner?.primary;
      const spouse = result.form8606ByOwner?.spouse;
      expect(primary?.line10.toFixed()).toBe('0.9999');
      expect(primary?.line12.toFixed()).toBe('9999');
      expect(primary?.line13.toFixed()).toBe('9999');
      expect(primary?.line14.toFixed()).toBe('0');
      expect(primary?.line15a.toFixed()).toBe('1');
      expect(primary?.line15c.toFixed()).toBe('1');
      expect(spouse?.line10.toFixed()).toBe('0.2');
      expect(spouse?.line14.toFixed()).toBe('1600');
      expect(spouse?.line15c.toFixed()).toBe('1600');
      expect(result.iraDistributionsTaxable.toFixed()).toBe('1601');
      expect(result.agi.toFixed()).toBe('86601');
      expect(result.allLines.find(line => line.form === '1040' && line.line === '4b')?.value.toFixed()).toBe('1601');

      const { fields } = FORM_8606_2026_CANDIDATE;
      const projection = projectForm86062026OrdinaryDistribution(input, 'primary');
      expect(projection[fields.line10Fraction]).toBe(primary?.line10.toFixed(4).split('.')[1]);
      for (const line of ['line12', 'line13', 'line14', 'line15a', 'line15c'] as const) {
        expect(projection[fields[line]]).toBe(primary?.[line].toFixed());
      }

      const unsupported = nearFullBasisJointFixture(2026, '999999', '1000000');
      expect(() => calculateFederalTax(TaxYearInputSchema.parse(unsupported))).toThrow(/Form 8606.*available basis/);

      const priorAdjustment = nearFullBasisJointFixture(2026, '9998');
      priorAdjustment.iraBasisSources.owners[0].basisHistory.line15cWorksheetAdjustment = '1';
      const existingMethod = calculateFederalTax(TaxYearInputSchema.parse(priorAdjustment));
      expect(existingMethod.form8606ByOwner?.primary?.line2.toFixed()).toBe('9999');
      expect(existingMethod.form8606ByOwner?.primary?.line10.toFixed()).toBe('1');
      expect(existingMethod.form8606ByOwner?.primary?.line15c.toFixed()).toBe('0');
    } finally {
      isolatedAnnualConstants.mockRestore();
    }
  });

  it('retains historical three-place basis allocation for the same originals', () => {
    const result = calculateFederalTax(TaxYearInputSchema.parse(nearFullBasisJointFixture(2025)));
    expect(result.form8606ByOwner?.primary?.line10.toFixed()).toBe('1');
    expect(result.form8606ByOwner?.primary?.line15c.toFixed()).toBe('0');
    expect(result.iraDistributionsTaxable.toFixed()).toBe('1600');
    expect(result.agi.toFixed()).toBe('86600');
  });
});
