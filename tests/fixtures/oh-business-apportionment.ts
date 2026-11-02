/** Actual synthetic originals, pinned before candidate outputs. */
export function ohioBusinessApportionmentFixture(profit = '400000') {
  const original = { accountHolder: 'primary', businessName: 'Synthetic Ordinary Services', grossReceipts: profit, expenses: { otherExpenses: '0', wages: '0', rentOnBusinessProperty: '0' } };
  const amount = (ohio: string, everywhere: string) => ({ ohio, everywhere });
  return {
    taxYear: 2025, filingStatus: 'single', federalAgi: '383725',
    originalBusinesses: [{ businessSourceId: 'actual-c-primary', accountHolder: 'primary', ownerResidencyStatus: 'nonresident', original, netProfit: profit, grossReceipts: profit, employeeCompensation: '0', netAnnualRent: '0' }],
    facts: {
      taxYear: 2025, sourceReference: 'Synthetic actual complete business records', sourceFactsConfirmed: true,
      allBusinessesIncludedConfirmed: true, noOtherBusinessIncomeOrAdjustmentsConfirmed: true,
      noFullYearResidentBusinessOwnersConfirmed: true,
      businesses: [{
        businessSourceId: 'actual-c-primary', accountHolder: 'primary', ownerResidencyStatus: 'nonresident',
        sourceTaxYear: 2025, sourceReference: 'Synthetic actual C and factor originals', sourceFactsConfirmed: true,
        originalBusiness: structuredClone(original),
        ordinarySoleProprietorshipConfirmed: true, fullCalendarYearBusinessConfirmed: true,
        noLowerTierEntitiesConfirmed: true, noSpecialIndustryOrAlternativeAllocationConfirmed: true,
        noSpecialBusinessSaleConfirmed: true, noOhioDepreciationAdjustmentsConfirmed: true,
        noOtherBusinessIncomeOrAdjustmentsConfirmed: true,
        property: { sourceReference: 'Actual ordinary property ledger', originalCostAndStatutoryExclusionsConfirmed: true,
          ownedBeginning: amount('10000', '20000'), ownedEnd: amount('10000', '20000'),
          annualRent: amount('0', '0'), annualSubrent: amount('0', '0'), fullYearUnchangedRentalConfirmed: true },
        payroll: { ...amount('0', '0'), sourceReference: 'Actual payroll complete ledger', qualifyingEmployeeCompensationConfirmed: true, noResearchOrSpecialIndustryPayrollConfirmed: true },
        sales: { sourceReference: 'Actual ordinary services purchaser-benefit records', allReceiptsIncludedConfirmed: true, noDuplicateReceiptSourcesConfirmed: true,
          ordinaryServicesAndStatutoryExclusionsConfirmed: true,
          rows: [{ receiptId: 'actual-invoice-001', sourceReference: 'Actual current service original', grossReceipt: profit, ohioBenefitReceipt: profit === '400000' ? '100000' : profit === '1000000' ? '250000' : '25000', purchaserBenefitSitusingConfirmed: true }] },
      }],
    },
  };
}
