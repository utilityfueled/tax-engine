import { K1PassiveDistributionSourcesSchema, type K1PassiveDistributionSources } from '@/models/k1-passive-distribution-sources';
import type { QbiSourceEntry } from './guided-qbi-loss-data';

export type K1PassiveDistributionData = QbiSourceEntry<K1PassiveDistributionSources>;
const amounts = new Set(['combinedParticipationHours', 'beginningHolderInterestValue', 'appreciatedContributionsFmv',
  'depreciatedContributionsBasis', 'beginningActivityValue', 'activityInterestDisposedValue', 'beginningPropertyValue',
  'propertyDisposedValue', 'fairMarketValue', 'adjustedBasis', 'ownerBasisAdjustment']);
/** Normalize only actual control spelling. Strict source schemas reject invented
 * gain or allocation fields; neither amounts nor identities receive defaults. */
export function normalizeGuidedK1PassiveDistribution(data: K1PassiveDistributionData | undefined): K1PassiveDistributionSources | undefined {
  if (data === undefined) return undefined;
  const visit = (value: unknown, key = ''): unknown => {
    if (value == null || value === '') return undefined;
    if (Array.isArray(value)) return value.map(row => visit(row));
    if (typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([name, item]) => [name, visit(item, name)]));
    if (typeof value !== 'string') return value;
    const text = value.trim();
    if (!text) return undefined;
    if (key === 'sourceTaxYear') {
      if (!/^\d{4}$/.test(text)) throw new Error('Enter the actual passive activity source year.');
      return Number(text);
    }
    if (amounts.has(key)) {
      const pattern = key === 'ownerBasisAdjustment' ? /^-?(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d+)?$/ : /^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d+)?$/;
      if (!pattern.test(text)) throw new Error(`Enter the actual ${key} source amount, including zero when known.`);
      return text.replaceAll(',', '');
    }
    return text;
  };
  return K1PassiveDistributionSourcesSchema.parse(visit(data));
}
