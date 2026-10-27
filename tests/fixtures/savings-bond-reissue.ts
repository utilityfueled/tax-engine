/** Fictional original records; Pub550's published registration/funding patterns. */
export function savingsBondReissueInput(taxYear = 2025) {
  return {
    taxpayer: {
      taxYear, filingStatus: "married_filing_jointly" as const,
      primary: { firstName: "Morgan", lastName: "Fixture", ssn: "900-70-3101", dateOfBirth: "1970-01-01" },
      spouse: { firstName: "Taylor", lastName: "Fixture", ssn: "900-70-3102", dateOfBirth: "1972-02-01" },
    },
    redemptions: [
      { sourceId: "bond-primary", reissueSourceId: "successor-primary", bondIdentifier: "EE-FICTIONAL-A", bondType: "paper_ee" as const,
        issueDate: "2000-01-01", redemptionDate: `${taxYear}-09-01`, ownerDateOfBirth: "1970-01-01",
        registeredOwner: "taxpayer" as const, ownershipConfirmed: true, faceValue: "500", proceeds: "500" },
      { sourceId: "bond-spouse", reissueSourceId: "successor-spouse", bondIdentifier: "EE-FICTIONAL-B", bondType: "paper_ee" as const,
        issueDate: "2000-01-01", redemptionDate: `${taxYear}-09-01`, ownerDateOfBirth: "1972-02-01",
        registeredOwner: "spouse" as const, ownershipConfirmed: true, faceValue: "500", proceeds: "500" },
    ],
    sources: {
      sourceTaxYear: taxYear, sourceReference: "Fictional original Treasury history", sourceFactsConfirmed: true,
      primary: { firstName: "Morgan", lastName: "Fixture", ssnLast4: "3101", dateOfBirth: "1970-01-01" },
      spouse: { firstName: "Taylor", lastName: "Fixture", ssnLast4: "3102", dateOfBirth: "1972-02-01" },
      groups: [{
        sourceId: "original-joint", originalBondIdentifier: "EE-FICTIONAL-ORIGINAL", sourceReference: "Fictional original purchase and reissue records",
        originalBondType: "paper_ee" as const, originalIssueDate: "2000-01-01", originalFaceValue: "1000",
        originalRegisteredOwner: "taxpayer_and_spouse" as const,
        taxpayerPurchaseFunds: "250", spousePurchaseFunds: "250", communityProperty: false,
        bothOriginalOwnersLivingConfirmed: true, allPriorReportingCompleteConfirmed: true,
        taxpayerPreviouslyReportedInterest: "0", spousePreviouslyReportedInterest: "0",
        reissueDate: `${taxYear - 1}-06-01`, valueAtReissue: "700", allSuccessorsCompleteConfirmed: true,
        successors: [
          { sourceId: "successor-primary", bondIdentifier: "EE-FICTIONAL-A", sourceReference: "Fictional successor A", faceValue: "500",
            registeredOwner: "taxpayer" as const, furtherOwnershipChanges: false,
            status: "redeemed" as const, redemptionSourceId: "bond-primary", postReissuePriorInterestReported: "0" },
          { sourceId: "successor-spouse", bondIdentifier: "EE-FICTIONAL-B", sourceReference: "Fictional successor B", faceValue: "500",
            registeredOwner: "spouse" as const, furtherOwnershipChanges: false,
            status: "redeemed" as const, redemptionSourceId: "bond-spouse", postReissuePriorInterestReported: "0" },
        ],
      }],
    },
  };
}
