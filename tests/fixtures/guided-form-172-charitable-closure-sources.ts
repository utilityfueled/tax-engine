/** Fictional original data shared by unit and production-browser checks. */
export function currentOriginCryptoGift() {
  return { asset: 'BTC', quantity: '0.0000000001234567890123456789123', dateAcquired: '2023-01-01', dateDonated: '2025-06-01',
    fairMarketValueAtDonation: '60000', costBasis: '40000', charityName: 'Synthetic current-origin public charity', charityEIN: '12-3456789',
    isQualifiedOrganization: true, recipientCategory: 'fifty-percent' as const, capitalAsset: true, fullOwnershipInterestDonated: true,
    noGoodsOrServicesReceived: true, substantiationRequirementsMet: true, appraisalRequired: true, qualifiedAppraisalObtained: true, sourceFactsConfirmed: true };
}
