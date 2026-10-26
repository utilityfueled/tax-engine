import { CryptoDonationSchema, type CryptoDonation } from '@/models/inputs';
import { calculateCryptoDonations } from '@/engine/forms/crypto-lot-matching';
import { parseGuidedCurrency } from './guided-currency';
import { guidedSourceValuesChanged } from './guided-source-confirmation';

/** Original source values only. Blank controls and unknown answers remain unknown. */
export type CryptoDonationData = {
  [Key in keyof CryptoDonation]?: CryptoDonation[Key] extends boolean | undefined
    ? boolean | null : CryptoDonation[Key];
};

function amount(value: string | undefined, label: string): string {
  if (!value?.trim()) throw new Error(`Enter the actual digital-asset gift ${label}; use 0 only when known.`);
  const parsed = parseGuidedCurrency(value);
  if (parsed.lt(0)) throw new Error(`The digital-asset gift ${label} cannot be negative.`);
  return parsed.toFixed();
}

export function buildGuidedCryptoDonations(data: CryptoDonationData[] | undefined, taxYear?: number | null): CryptoDonation[] | undefined {
  if (data === undefined) return undefined;
  if (taxYear !== 2025 && taxYear !== 2026) throw new Error('Confirm the actual return year before entering digital-asset gifts.');
  const originals = data.map((row, index) => {
    try {
      if (!row.asset?.trim() || !row.charityName?.trim()) throw new Error('Enter the actual asset and recipient name.');
      if (row.sourceFactsConfirmed !== true) throw new Error('Check the digital-asset gift originals after the last edit.');
      if (typeof row.isQualifiedOrganization !== 'boolean') throw new Error("Confirm the recipient's actual charitable qualification.");
      if (row.charityEIN?.trim() && !/^\d{2}-?\d{7}$/.test(row.charityEIN.trim())) throw new Error('Reconcile the entered recipient EIN with the original record.');
      const original = CryptoDonationSchema.parse({
        ...Object.fromEntries(Object.entries(row).map(([key, value]) => [key, value === null ? undefined : value])),
        asset: row.asset.trim(), charityName: row.charityName.trim(), charityEIN: row.charityEIN?.trim() || undefined,
        quantity: amount(row.quantity, 'quantity'),
        fairMarketValueAtDonation: amount(row.fairMarketValueAtDonation, 'fair market value'),
        costBasis: amount(row.costBasis, 'original cost basis'),
      });
      // This facts-only validation has no AGI or editable deduction override.
      calculateCryptoDonations([original], taxYear);
      return original;
    } catch (error) {
      throw new Error(`Digital-asset gift ${index + 1}: ${error instanceof Error ? error.message : 'Reconcile the original records.'}`, { cause: error });
    }
  });
  // A known annual similar-property group can require an appraisal even when
  // no individual row exceeds the threshold.
  calculateCryptoDonations(originals, taxYear);
  return originals;
}

export function cryptoDonationFactErrors(data: CryptoDonationData[] | undefined, taxYear?: number | null): Record<string, string> {
  try { buildGuidedCryptoDonations(data, taxYear); return {}; }
  catch (error) { return { cryptoDonations: error instanceof Error ? error.message : 'Reconcile the actual digital-asset gift records.' }; }
}

export function updateCryptoDonation(previous: CryptoDonationData, patch: Partial<CryptoDonationData>): CryptoDonationData {
  const next = { ...previous, ...patch };
  return guidedSourceValuesChanged(previous, next) ? { ...next, sourceFactsConfirmed: null } : next;
}
