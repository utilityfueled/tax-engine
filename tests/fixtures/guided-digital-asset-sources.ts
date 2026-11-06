import type { DigitalAssetEntryData } from '../../apps/web/src/lib/guided-digital-asset-facts';
import { actualDigitalAssetSource } from './digital-asset-sources';

export function actualGuidedDigitalAsset(): DigitalAssetEntryData {
  return { ...structuredClone(actualDigitalAssetSource), taxYear: '2025', transactions: actualDigitalAssetSource.transactions.map(row => ({
    ...row, reportedDateAcquired: '', reportedCostBasis: '', reportedDateAcquiredBlank: true, reportedCostBasisBlank: true,
  })) };
}
