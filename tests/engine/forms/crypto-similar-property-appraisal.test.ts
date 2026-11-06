// Spec: spec/federal/crypto-similar-property-appraisal.yaml.
import { expect, it } from 'vitest';
import { calculateCryptoDonations } from '@/engine/forms/crypto-lot-matching.js';
import { CryptoDonationSchema, type CryptoDonation } from '@/models/inputs.js';

function gift(patch: Partial<CryptoDonation> = {}): CryptoDonation {
  return CryptoDonationSchema.parse({ asset: 'BTC', quantity: '0.1234567890123456789',
    dateAcquired: '2023-01-01', dateDonated: '2025-06-01',
    fairMarketValueAtDonation: '4000', costBasis: '1000', charityName: 'First actual recipient',
    isQualifiedOrganization: true, recipientCategory: 'fifty-percent', capitalAsset: true,
    sourceFactsConfirmed: true, fullOwnershipInterestDonated: true, noGoodsOrServicesReceived: true,
    substantiationRequirementsMet: true, appraisalRequired: false, qualifiedAppraisalObtained: false,
    ...patch });
}

it('checks the known annual asset group across recipients and row order', () => {
  for (const taxYear of [2025, 2026]) {
    const first = gift({ dateDonated: `${taxYear}-06-01` });
    const second = gift({ asset: ' btc ', dateDonated: `${taxYear}-12-31`, charityName: 'Second actual recipient' });
    for (const rows of [[first, second], [second, first]]) {
      const before = structuredClone(rows);
      expect(() => calculateCryptoDonations(rows, taxYear)).toThrow(/similar.*appraisal|appraisal.*similar/i);
      expect(rows).toEqual(before);
      const confirmed = rows.map(row => ({ ...row, appraisalRequired: true, qualifiedAppraisalObtained: true }));
      expect(calculateCryptoDonations(confirmed, taxYear).totalDeduction.toFixed()).toBe('8000');
      expect(() => calculateCryptoDonations([confirmed[0], { ...confirmed[1], qualifiedAppraisalObtained: undefined }], taxYear)).toThrow(/appraisal/i);
    }
  }
});

it('uses exact values and the contribution basis at the threshold', () => {
  const first = gift({ fairMarketValueAtDonation: '2500' });
  const second = gift({ fairMarketValueAtDonation: '2500', charityName: 'Second actual recipient' });
  expect(calculateCryptoDonations([first, second]).totalDeduction.toFixed()).toBe('5000');
  expect(() => calculateCryptoDonations([first, { ...second, fairMarketValueAtDonation: '2500.01' }])).toThrow(/appraisal/i);
  const short = [gift({ dateAcquired: '2025-01-01' }), gift({ dateAcquired: '2025-01-01', charityName: 'Second actual recipient' })];
  expect(calculateCryptoDonations(short).totalDeduction.toFixed()).toBe('2000');
  const basisReduced = [gift({ recipientCategory: 'private-nonoperating' }), gift({ recipientCategory: 'private-nonoperating', charityName: 'Second actual foundation' })];
  expect(calculateCryptoDonations(basisReduced).totalDeduction.toFixed()).toBe('2000');
});

it('retains external appraisal facts zero and historical uncertainty', () => {
  expect(() => calculateCryptoDonations([gift({ fairMarketValueAtDonation: '1', appraisalRequired: true })])).toThrow(/appraisal/i);
  expect(calculateCryptoDonations([gift(), gift({ isQualifiedOrganization: false })]).totalDeduction.toFixed()).toBe('4000');
  expect(calculateCryptoDonations([gift(), gift({ fairMarketValueAtDonation: '0' })]).totalDeduction.toFixed()).toBe('4000');
  expect(calculateCryptoDonations([gift(), gift({ asset: 'ETH' })]).totalDeduction.toFixed()).toBe('8000');
  const legacy = [gift({ sourceFactsConfirmed: undefined }), gift({ sourceFactsConfirmed: undefined })];
  expect(calculateCryptoDonations(legacy).sourceFactsVerified).toBe(false);
  expect(() => calculateCryptoDonations([gift(), legacy[0]])).toThrow(/appraisal/i);
  expect(() => calculateCryptoDonations([gift(), gift({ dateDonated: '2024-12-31' })])).toThrow(/year/i);
});
