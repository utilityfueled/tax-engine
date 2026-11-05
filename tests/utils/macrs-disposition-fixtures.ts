/** Fictional original records and actual-history inputs; IRS published disposal arithmetic supplies the oracle. */
export function dispositionFixture(kind: 'quarter' | 'residential' | 'half' = 'quarter') {
    const info = kind === 'quarter' ? {
        cost: '10000', pis: '2022-12-02', date: '2025-04-10', period: '5', method: '200DB', convention: 'midQuarter', years: [2022, 2023, 2024], prior: ['500', '3800', '2280'], opening: '3420'
    } : kind === 'residential' ? {
        cost: '100000', pis: '2023-07-02', date: '2025-03-10', period: '27.5', method: 'SL', convention: 'midMonth', years: [2023, 2024], prior: ['1667', '3636'], opening: '94697'
    } : {
        cost: '10005.20', pis: '2023-06-01', date: '2025-05-10', period: '5', method: '200DB', convention: 'halfYear', years: [2023, 2024], prior: ['2001', '3202'], opening: '4802.20'
    };
    const prior = kind === 'quarter' ? '6580' : kind === 'residential' ? '5303' : '5203';
    const asset = {
        description: 'Fictional ordinary asset', costBasis: info.cost, placedInServiceDate: info.pis, recoveryPeriod: info.period, method: info.method, convention: info.convention, disposedDuringYear: true, isListedProperty: false, isPassengerAutomobile: false, businessUsePercentage: 100, firstYearBonusEligible: false, section280FRecaptureTriggered: false, cumulativePriorMacrsDeductions: prior, cumulativePriorAdsDeductions: '0'
    };
    return {
        ...asset, dispositionSources: {
            historyRounding: 'whole_dollar_each_year', constantOwnershipConfirmed: true, noSystemOrMethodChangeConfirmed: true, version: 'macrs-disposition-v1', sourceTaxYear: 2025, sourceReference: 'fictional-complete-originals', assetIdentity: 'fictional-asset-1', activityIdentity: 'fictional-schedule-c-or-rental', originalBasisSourceReference: 'fictional-purchase-document', originalConventionSourceReference: 'fictional-original-filed-depreciation-schedule', originalElectionSourceReference: 'fictional-original-election', dispositionSourceReference: 'fictional-ordinary-whole-asset-sale', historySourceReference: 'fictional-prior-returns', confirmed: true, system: 'GDS', calendarYear: true, dispositionKind: 'whole_asset_sale', ownershipPercentage: '100', businessUsePercentage: '100', constantUseConfirmed: true, noOtherBasisAdjustmentsConfirmed: true, noConversionOrCarryoverBasisConfirmed: true, noPartialOrGeneralAssetAccountConfirmed: true, section179Deduction: '0', bonusDeduction: '0', otherBasisAdjustments: '0', bonusTreatment: kind === 'residential' ? 'not_applicable' : 'elected_out', grossCostBasis: info.cost, originalMacrsBasis: info.cost, adjustedBasisAtYearStart: info.opening, dispositionDate: info.date, assetSnapshot: {
                ...asset
            }, history: info.years.map((year, i) => ({
                taxYear: year, sourceReference: `fictional-filed-${year}`, originalMacrsBasis: info.cost, businessUsePercentage: '100', section179Deduction: '0', bonusDeduction: '0', otherBasisAdjustments: '0', regularAllowedOrAllowable: info.prior[i], regularClaimed: info.prior[i]
            }))
        }
    };
}
