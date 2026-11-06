import { TaxYearInputSchema } from '@/models/inputs.js';
import { simpleW2Fixture } from './simple-w2.js';
import { syntheticChildElection } from './form-8814-election.js';

/** Explicit synthetic original sources; not production defaults. */
export function syntheticScheduleDSpecialGainInput(year: number, shortLoss = '-1000') {
  return TaxYearInputSchema.parse({ ...simpleW2Fixture, taxpayer: { ...simpleW2Fixture.taxpayer, taxYear: year },
    form8814: [{ taxableInterest: '4000', taxExemptInterest: '0', ordinaryDividends: '0', qualifiedDividends: '0', capitalGainDistributions: '6000',
      electionFacts: { ...syntheticChildElection(year), incomeCharacter: { sourceReference: 'Child actual capital statement', alaskaPermanentFundDividends: '0', collectiblesGain: '1000', unrecapturedSection1250Gain: '2000', section1202Gain: '0' } } }],
    priorYear: { shortTermCapitalLoss: shortLoss },
    scheduleDSpecialGainSources: { taxYear: year, sourceReference: 'Actual capital source worksheet', sourceFactsConfirmed: true, allSourcesIncluded: true,
      primary: { firstName: 'Jane', lastName: 'Doe', ssnLast4: '6789' }, priorShortTermCapitalLoss: shortLoss, priorLongTermCapitalLoss: '0', section1231Lookback: '0',
      amtBasisAndCarryoversSameAsRegularConfirmed: true, form2439Present: false, partnershipInterestDispositionPresent: false, other1250DispositionPresent: false, longTermAssets: [], reportedGains: [] },
  });
}
