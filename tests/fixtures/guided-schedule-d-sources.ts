import type { ScheduleDSourceData } from '../../apps/web/src/lib/guided-schedule-d-sources';
/** Explicit fictional worksheet answers, never interview defaults. */
export const actualGuidedScheduleD: ScheduleDSourceData = {
  sourceTaxYear: '2025', sourceReference: 'Actual capital worksheet', sourceFactsConfirmed: true, allSourcesIncluded: true,
  primary: { firstName: 'Jordan', lastName: 'Example', ssnLast4: '3333' },
  priorShortTermCapitalLoss: '-1000', priorLongTermCapitalLoss: '0', section1231Lookback: '0',
  amtBasisAndCarryoversSameAsRegularConfirmed: true, form2439Present: false,
  partnershipInterestDispositionPresent: false, other1250DispositionPresent: false,
  longTermAssets: [], reportedGains: [],
};
