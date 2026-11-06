// Spec: spec/federal/charitable-original-source-nol.yaml exact-binding.
import { expect, it } from 'vitest';
import { readCurrentCharitableSourceForNol, validateCharitableNolContributionLimit } from '@/utils/charitable-nol-source.js';
import { d } from '@/utils/decimal.js';
import { calculateFederalTax } from '@/engine/federal.js';
import { cryptoCharitableNolInput, k1CharitableNolInput, originalNolFixtureSource as requireSource } from '../../fixtures/charitable-original-source-nol.js';
import { charitableStatement } from '../../fixtures/k1-charitable-return.js';

it('binds exact original K1 and crypto receipts to one qualified category', () => {
  const input = cryptoCharitableNolInput(), receipt = requireSource(input.cryptoIncome).donations[0];
  requireSource(input.cryptoIncome).donations = [{ ...receipt, fairMarketValueAtDonation: '60000.24' }, { ...receipt, fairMarketValueAtDonation: '0.25', costBasis: '0.10' }];
  const source = readCurrentCharitableSourceForNol(input);
  expect([source.category, source.medium, source.amount.toFixed()]).toEqual(['capital_gain_30', 'noncash', '60000.49']);
  const cap = { ...source, amount: d('13200'), ledger: 'regular' as const };
  expect(validateCharitableNolContributionLimit(input, cap).amount.toFixed()).toBe('60000.49');
  const reversed = structuredClone(input); requireSource(reversed.cryptoIncome).donations.reverse();
  expect(readCurrentCharitableSourceForNol(reversed).amount.eq(source.amount)).toBe(true);
  for (const change of [
    (copy: typeof input) => { requireSource(copy.cryptoIncome).donations[0].costBasis = '20000.01'; },
    (copy: typeof input) => { requireSource(copy.cryptoIncome).donations[0].charityName = 'Different actual recipient'; },
    (copy: typeof input) => { requireSource(requireSource(requireSource(copy.netOperatingLoss).alternativeTax).charitableCarryoverHistory).sourceReference += ' changed'; },
  ]) {
    const copy = structuredClone(input); change(copy);
    expect(() => validateCharitableNolContributionLimit(copy, cap)).toThrow(/reconcile|source/);
  }
  const k1 = k1CharitableNolInput(); const original = readCurrentCharitableSourceForNol(k1);
  const changed = structuredClone(k1); requireSource(requireSource(charitableStatement(changed).basis).currentContributions)[0].adjustedBasisShare = '40000.01';
  expect(() => validateCharitableNolContributionLimit(changed, { ...original, amount: d('13200'), ledger: 'alternative' })).toThrow(/reconcile|source/);
  input.scheduleK1 = k1.scheduleK1; input.k1CharitableSources = k1.k1CharitableSources;
  expect(readCurrentCharitableSourceForNol(input).amount.toFixed()).toBe('120000.49');
  expect(() => calculateFederalTax(cryptoCharitableNolInput(2026))).toThrow(/2026|review|calculat/i);
});
