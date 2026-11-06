import { emptyAdjustmentData, emptyCreditsData } from '@/lib/guided-interview-flow';
import { completeBusinessSection, startCompleteInterview } from '../guided-interview/complete-facts';
import { marketplaceMarriageHealthRecords } from './marketplace-marriage-health-records';

export function guidedMarketplaceMarriageHealthState() {
  const state=startCompleteInterview({filingStatus:'mfj',incomeTypes:['self-employment'],lifeEvents:['self-employed-health-insurance'],stateCode:null});
  const records=marketplaceMarriageHealthRecords();
  state.sectionData['personal-info']=records.personal;
  state.sectionData['income-self-employment']={...structuredClone(completeBusinessSection),manualGrossReceipts:'100000'};
  state.sectionData.adjustments={...emptyAdjustmentData,healthInsuranceFacts:records.health};
  state.sectionData.credits={...emptyCreditsData,premiumTaxCredit:records.coverage};
  return state;
}
