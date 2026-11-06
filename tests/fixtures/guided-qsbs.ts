import type { QsbsSourceData } from '../../apps/web/src/lib/guided-qsbs-sources';

/** Entirely synthetic original records, never production defaults. */
export const actualGuidedQsbs: QsbsSourceData = {
  sourceTaxYear: '2025', sourceReference: 'Private original issuer packet', sourceFactsConfirmed: true,
  allSourcesIncluded: true, preExclusionAmountsConfirmed: true,
  primary: { firstName: 'Jordan', lastName: 'Example', ssnLast4: '3333' },
  issuers: [{ issuerId: 'actual-issuer', issuerName: 'Synthetic eligible corporation', sourceReference: 'Actual corporate source',
    allPriorUseAndCurrentDispositionsConfirmed: true, membershipUnchangedConfirmed: true, priorEligibleGainUsed: '0',
    historySourceReference: 'Original prior returns and complete history', priorReturns: [] }],
  lots: [{ lotId: 'actual-lot', sourceId: 'form1099B:0:transaction:0', issuerId: 'actual-issuer', sourceReference: 'Original lot record',
    accountHolder: 'primary', payerName: 'Actual broker', securityDescription: 'Synthetic eligible corporation', acquisitionMethod: 'original_issue',
    originalIssueDate: '2008-01-02', effectiveAcquiredDate: '2008-01-02', dateSold: '2025-06-30',
    recognizedGain: '1000.25', basisIgnoringPostIssueAdditions: '100.10', empowermentZoneGainThrough2018: '0', empowermentQualificationAndAttributionConfirmed: false,
    proceeds: '1100.35', costBasis: '100.10', adjustments: '0', washSale: false, washSaleDisallowed: '0',
    qualification: { domesticCCorporationAtIssue: true, consideration: 'money', allPredecessorAndControlledGroupAssetsIncluded: true,
      maxGrossAssetsBeforeIssue: '50000000', grossAssetsImmediatelyAfterIssue: '50000000', cCorporationThroughoutHolding: true,
      activeBusinessRequirementSatisfied: true, redemptionRestrictionsSatisfied: true, offsettingPositionPresent: false },
  }],
};
