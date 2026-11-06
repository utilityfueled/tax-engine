import { currentOriginCharitableHistorySources } from './form-172-charitable-history-sources';
import { actualGuidedNolSources } from './guided-net-operating-loss';

/** Actual fictional old sources shared by guide, browser and saved packet checks. */
export function carriedCurrentCharitableSources() {
  const sources = currentOriginCharitableHistorySources();
  const original = structuredClone(actualGuidedNolSources.vintages?.[0]);
  if (!sources.prior.alternativeTax || !original) throw new Error('Missing fictional original old loss');
  const vintage = { ...original, originalLoss: '100000', openingCarryforward: '100000', history: [], section1411OriginalLoss: '0' };
  sources.prior.vintages = [vintage];
  sources.prior.alternativeTax.vintages = [{ ...vintage, sourceId: 'independent-old-amt2021', section1411OriginalLoss: undefined }];
  return sources;
}
