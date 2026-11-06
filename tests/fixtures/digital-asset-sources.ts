export const actualDigitalAssetSource = {
  sourceId: 'Actual DA statement A', taxYear: 2025, sourceReference: 'Original recipient1099DA and acquisition records',
  sourceFactsConfirmed: true, allTransactionsIncluded: true,
  brokerName: 'Actual digital broker', brokerTin: '12-3456789', accountReference: 'Actual account A', accountHolder: 'primary' as const,
  federalWithheld: '0.10', stateTaxReporting: 'none' as const, stateWithheld: '0',
  transactions: [{ sourceId: 'Original disposition1', digitalAssetCode: 'ACTUAL-DTIF', digitalAssetName: 'Bitcoin', ticker: 'BTC', quantity: '0.001',
    reportedDateAcquired: null, reportedCostBasis: null, dateAcquired: '2025-01-15', dateSold: '2025-06-01',
    proceeds: '100.49', costBasis: '90.24', basisReportedToIRS: false, holdingPeriod: 'short' as const, transactionType: 'sale' as const,
    basisSource: 'taxpayer_records' as const, basisSourceReference: 'Actual original lot purchase confirmation', basisFactsConfirmed: true,
    proceedsType: 'gross' as const, sellingExpenses: '0', marketDiscount: '0', washSale: false, washSaleDisallowed: '0', adjustments: '0',
    qof: false, lossNotAllowed: false, ordinaryIncome: false, onlyCashProceeds: true, customerProvidedAcquisitionInformation: true,
    noncoveredSecurity: true, optionalReportingMethod: 'none' as const, assetOrigin: 'purchase' as const,
    capitalAssetConfirmed: true, nftOrCollectible: false }],
};
