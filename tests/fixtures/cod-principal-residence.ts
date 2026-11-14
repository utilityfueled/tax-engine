/** Original fictional retained-home records; no claimed exclusion override. */
export function principalResidenceCodInput(year = 2025) {
  const date = `${year}-09-15`;
  return {
    taxpayer: { taxYear: year, filingStatus: 'single', primary: { firstName: 'Fictional', lastName: 'Homeowner',
      ssn: '000-00-0001', dateOfBirth: '1985-01-01' }, address: { street: '100 Example St', city: 'Philadelphia', state: 'PA', zip: '19101' }, dependents: [] },
    form1099C: [{ creditor: 'Fictional Mortgage Lender', amountDischarged: '100000', interestIncluded: '0',
      fmvOfProperty: '600000', personallyLiable: true, identifiableEventCode: 'F', debtDescription: 'Original main-home acquisition mortgage' }],
    form982PrincipalResidenceSources: {
      sourceTaxYear: year, sourceReference: 'Fictional original retained-home workout packet', sourceFactsConfirmed: true,
      allDischargesIncluded: true, allResidenceSecuredLoansIncluded: true, regularAndAlternativeExclusionSameConfirmed: true,
      communityPropertyApplies: false, title11Case: false, electInsolvencyInstead: false, otherExclusionsOrExceptionsApply: false,
      solelyPrimaryOwnedConfirmed: true, retainedResidenceConfirmed: true, noPropertyTransferConfirmed: true,
      neverBusinessOrRentalUseConfirmed: true,
      debt: { sourceId: 'form1099C:0', statementId: 'fictional-mortgage-statement', sourceTaxYear: year,
        sourceReference: 'Fictional original lender cancellation and pre-discharge balance', sourceFactsConfirmed: true,
        accountHolder: 'primary', debtorName: 'Fictional Homeowner', debtorSsnLast4: '0001',
        creditor: 'Fictional Mortgage Lender', creditorTin: '000000001', accountReference: 'fictional-mortgage-account',
        dischargeDate: date, amountDischarged: '100000', interestIncluded: '0', fmvOfProperty: '600000',
        personallyLiable: true, identifiableEventCode: 'F', debtDescription: 'Original main-home acquisition mortgage',
        completePrincipalCancellationConfirmed: true, actualDischargedPrincipal: '100000', actualDischargedInterest: '0',
        noDeductibleInterestDischargedConfirmed: true,
      },
      acquisition: { sourceReference: 'Fictional original purchase and mortgage closing records', sourceFactsConfirmed: true,
        mainHomeConfirmed: true, securedByResidenceConfirmed: true, originalLoanNotRefinancedConfirmed: true,
        allProceedsAcquisitionUseConfirmed: true, acquisitionUse: 'buy_build_substantially_improve',
        immediatelyBeforeDischargeConfirmed: true, balanceAsOfDate: date, outstandingPrincipal: '800000',
        originationDate: '2024-01-15', originalAcquisitionPrincipal: '900000', noCapitalizedInterestOrAddedPrincipalConfirmed: true,
        residenceAddress: { street: '100 Example St', city: 'Philadelphia', state: 'PA', zip: '19101' } },
      reason: { sourceReference: 'Fictional lender workout agreement', sourceFactsConfirmed: true,
        reason: 'taxpayer_financial_condition', noLenderServicesConsiderationConfirmed: true },
      basis: { sourceReference: 'Fictional original residence basis history through discharge', sourceFactsConfirmed: true,
        asOfDate: date, allBasisChangesIncluded: true, purchaseCost: '880000', acquisitionCosts: '10000',
        capitalImprovements: '20000', previousBasisReductions: '610000' },
      ...(year === 2026 ? { arrangement: { sourceReference: 'Fictional actual pre2026 written workout', sourceFactsConfirmed: true,
        enteredDate: '2025-12-20', evidencedInWritingDate: '2025-12-20', dischargeSubjectToArrangementConfirmed: true } } : {}),
    },
  };
}
