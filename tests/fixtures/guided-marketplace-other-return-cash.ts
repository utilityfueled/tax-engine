import { buildSectionRoute } from '@/lib/guided-interview-flow';
import { guidedMarketplaceOutsidePersonState } from './guided-marketplace-outside-person';
import { guidedMarriageOutsidePersonState } from './guided-marriage-outside-person';
import { marketplaceOtherReturnCashRecords, otherReturnHealthPaymentRecords } from './marketplace-other-return-cash-records';

export function guidedMarketplaceOtherReturnCashState(mode: 'cash' | 'advance' | 'marriage' = 'advance') {
  const state = mode === 'marriage' ? guidedMarriageOutsidePersonState() : guidedMarketplaceOutsidePersonState(true);
  const records = marketplaceOtherReturnCashRecords(mode);
  if ('personal' in records) state.sectionData['personal-info'] = records.personal;
  state.sectionData.adjustments!.healthInsuranceFacts = records.health;
  state.sectionData.credits!.premiumTaxCredit = records.coverage;
  state.sectionData.payments = otherReturnHealthPaymentRecords(mode === 'marriage');
  state.completedSections = buildSectionRoute(state.segmentation).map(section => section.id);
  return state;
}
