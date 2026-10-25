import { TaxYearInputSchema } from '@/models/inputs.js';
import { simpleW2Fixture } from './simple-w2.js';

export function qsbsSourceFacts(kind: 'broker' | 'fund' = 'broker') {
  return {
    taxYear: 2025, sourceReference: 'Private original QSBS packet', sourceFactsConfirmed: true,
    allSourcesIncluded: true, preExclusionAmountsConfirmed: true,
    primary: { firstName: 'Jane', lastName: 'Doe', ssnLast4: '6789' },
    issuers: [{ issuerId: 'actual-issuer', issuerName: 'Synthetic eligible corporation', sourceReference: 'Private corporate history',
      allPriorUseAndCurrentDispositionsConfirmed: true, membershipUnchangedConfirmed: true,
      priorEligibleGainUsed: '0', historySourceReference: 'Prior filed return and complete history', priorReturns: [] }],
    lots: [{ lotId: 'actual-lot', sourceId: kind === 'broker' ? 'form1099B:0:transaction:0' : 'form1099Div:0',
      sourceReference: 'Private lot statement', accountHolder: 'primary', payerName: kind === 'broker' ? 'Actual broker' : 'Actual fund',
      securityDescription: 'Synthetic eligible corporation', issuerId: 'actual-issuer', acquisitionMethod: 'original_issue',
      originalIssueDate: '2008-01-02', effectiveAcquiredDate: '2008-01-02', dateSold: '2025-06-30',
      recognizedGain: '1000.25', basisIgnoringPostIssueAdditions: '100.10', empowermentZoneGainThrough2018: '0',
      empowermentQualificationAndAttributionConfirmed: false,
      proceeds: kind === 'broker' ? '1100.35' : undefined, costBasis: kind === 'broker' ? '100.10' : undefined,
      adjustments: kind === 'broker' ? '0' : undefined, washSale: kind === 'broker' ? false : undefined, washSaleDisallowed: kind === 'broker' ? '0' : undefined,
      qualification: { domesticCCorporationAtIssue: true, consideration: 'money',
        allPredecessorAndControlledGroupAssetsIncluded: true, maxGrossAssetsBeforeIssue: '50000000', grossAssetsImmediatelyAfterIssue: '50000000',
        cCorporationThroughoutHolding: true, activeBusinessRequirementSatisfied: true, redemptionRestrictionsSatisfied: true, offsettingPositionPresent: false },
      passThrough: kind === 'fund' ? { ownerInterestAcquiredDate: '2007-01-02', heldContinuouslyThroughSale: true,
        unchangedOwnershipProportionConfirmed: true, ownershipPercentage: '1', entityRecognizedGain: '100025',
        entityBasisIgnoringPostIssueAdditions: '10010', fundCapitalGainDistributions: '1500.50', fundSection1202Gain: '1000.25' } : undefined,
    }],
  };
}

export function qsbsInput(kind: 'broker' | 'fund' = 'broker') {
  return TaxYearInputSchema.parse({ ...simpleW2Fixture,
    form1099B: kind === 'broker' ? [{ broker: 'Actual broker', accountHolder: 'primary', transactions: [{
      description: 'Synthetic eligible corporation', dateAcquired: '2008-01-02', dateSold: '2025-06-30',
      proceeds: '1100.35', costBasis: '100.10', adjustments: '0', washSale: false, washSaleDisallowed: '0', holdingPeriod: 'long', basisReportedToIRS: false,
    }] }] : [],
    form1099Div: kind === 'fund' ? [{ payer: 'Actual fund', accountHolder: 'primary', ordinaryDividends: '0',
      totalCapitalGainDistributions: '1500.50', section1202Gain: '1000.25' }] : [],
    section1202Sources: qsbsSourceFacts(kind),
  });
}
