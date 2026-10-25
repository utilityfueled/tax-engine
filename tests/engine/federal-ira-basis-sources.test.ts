// Spec: spec/federal/ira-basis-sources.yaml canonical-return.
import { describe, expect, it } from 'vitest';
import { calculateFederalTax } from '@/engine/federal.js';
import { TaxYearInputSchema } from '@/models/inputs.js';
import { getRulePack } from '@/models/constants.js';
import { ordinaryIraBasisFixture } from '../fixtures/ira-basis.js';

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

  it('preserves the public2026 gate despite complete current-year sources', () => {
    const input = ordinaryIraBasisFixture();
    input.taxpayer.taxYear = 2026; input.iraBasisSources.taxYear = 2026;
    input.form1099R.forEach(source => { source.taxYear = 2026; source.trumpAccount = false; source.excessContributionEarnings = '0'; });
    input.iraBasisSources.distributions.forEach(source => { source.taxYear = 2026; });
    input.iraBasisSources.owners.forEach(owner => { owner.basisHistory.taxYear = 2025; owner.accounts.forEach(account => { account.taxYear = 2026; }); });
    expect(() => calculateFederalTax(TaxYearInputSchema.parse(input))).toThrow(/2026/);
    expect(getRulePack(2026).calculationStatus).toBe('incomplete');
    expect(getRulePack(2026).filingQualified).toBe(false);
  });
});
