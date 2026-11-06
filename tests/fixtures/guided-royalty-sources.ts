/** Explicit fictional source records, never application defaults. */
export function actualGuidedRoyaltySources() {
  const original = { sourceId:'royalty-original-1', sourceTaxYear:'2025', sourceFormRevision:'2025-04',
    payer:'Fictional Royalty Payer', payerTin:'12-3456789', accountReference:'royalty-account-1', accountHolder:'primary',
    rents:'0', royalties:'12000.25', otherIncome:'0', federalWithheld:'100.10', fishingBoatProceeds:'0', medicalPayments:'0',
    substitutePayments:'0', cropInsurance:'0', grossAttorneyProceeds:'0', fishPurchasedForResale:'0', section409ADeferrals:'0',
    nonqualifiedDeferredComp:'0', directSales:false, fatcaFilingRequirement:false, stateTaxReporting:'single',
    state:'MI', payerStateId:'fictional-state-payer', stateWithheld:'80.20', stateIncome:'12000.25',
    royaltyOnlyIncomeConfirmed:true, sourceFactsConfirmed:true };
  return { sourceTaxYear:'2025', sourceReference:'Fictional complete royalty ledger', sourceFactsConfirmed:true,
    allDirectRoyaltySourcesIncluded:true, statements:[original], properties:[{
      propertyId:'copyright-1', propertyReference:'Fictional copyright record', accountHolder:'primary', propertyType:'copyright',
      tradeOrBusiness:false, operatingInterest:false, capitalDisposition:false, foreignSource:false, communityPropertyAllocationRequired:false,
      cashMethod:true, sameRegularAmtTreatmentConfirmed:true, currentYearExpensesComplete:true,
      interestExpense:'0', depreciationExpense:'0', depletionExpense:'0', otherExpenses:'0', priorUnallowedExpenses:'0',
      incomeSources:[{sourceId:'royalty-original-1', allocatedGross:'12000.25', original:{sourceId:original.sourceId,
        accountReference:original.accountReference, taxYear:'2025', sourceFormRevision:original.sourceFormRevision,
        payer:original.payer, accountHolder:original.accountHolder, royalties:original.royalties}}],
      expenses:[{sourceId:'receipt-legal',sourceReference:'Fictional private legal receipt',paidDate:'2025-02-15',category:'legal-professional',amountPaid:'49.25',
        ordinaryNecessaryForProperty:true,relatesOnlyToCurrentYear:true,capitalOrImprovement:false,personalOrOwnLabor:false,reimbursed:false},
        {sourceId:'receipt-agent',sourceReference:'Fictional private agent receipt',paidDate:'2025-12-31',category:'management-fees',amountPaid:'950.50',
          ordinaryNecessaryForProperty:true,relatesOnlyToCurrentYear:true,capitalOrImprovement:false,personalOrOwnLabor:false,reimbursed:false}],
    }] };
}
