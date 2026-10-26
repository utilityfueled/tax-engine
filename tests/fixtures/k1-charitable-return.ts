import { TaxYearInputSchema } from '@/models/inputs.js';
import { simpleW2Fixture } from './simple-w2.js';
import { k1QbiLossSourceInput } from './k1-qbi-loss-sources.js';
/** Fictional original K1, attached gift statement and independent at-risk worksheet. */
export function k1CharitableReturnFixture(year = 2025, cash = false) {
    const input = TaxYearInputSchema.parse(structuredClone(simpleW2Fixture));
    input.taxpayer.taxYear = year;
    input.w2s[0].wages = '100000';
    input.w2s[0].federalWithheld = '30000';
    input.deductionElection = 'itemized';
    return TaxYearInputSchema.parse({ ...input, scheduleK1: [{
                taxYear: year, partnershipName: 'Fictional Giving Partners', partnershipEIN: '98-7654321', entityType: 'partnership', accountHolder: 'primary',
                ordinaryIncome: '0', beginningBasis: cash ? '3000' : '30', charitableCash: cash ? '5000' : '0', charitableCapitalGain30: cash ? '0' : '150', charitableCapitalGain20: '0',
                isPassiveActivity: false, section199AQBI: '0', selfEmploymentFactsConfirmed: true, selfEmploymentIncomeType: 'nonfarm', selfEmploymentEarnings: '0', selfEmploymentNetEarningsAfterAdjustments: '0',
                priorSuspendedLosses: {}, form6198: { activityName: 'Fictional Giving Partners', ordinaryIncome: '0', gainLossFromDispositions: '0', otherIncomeGains: '0', otherDeductionsLosses: '0',
                    adjustedBasisAtEffectiveDate: '0', priorYearAmountAtRisk: '20000', currentYearIncreases: '0', currentYearDecreases: '0' },
            }], k1CharitableSources: { sourceTaxYear: year, sourceReference: 'Fictional complete K1 attachments', sourceFactsConfirmed: true, allK1CharitableSourcesIncluded: true, statements: [{
                    k1SourceId: 'scheduleK1:0', sameRegularAmtTreatmentConfirmed: true,
                    basis: { sourceTaxYear: year, statementYearStart: `${year}-01-01`, statementYearEnd: `${year}-12-31`, sourceReference: 'Fictional original basis worksheet', sourceFactsConfirmed: true,
                        entityName: 'Fictional Giving Partners', entityEIN: '98-7654321', entityType: 'partnership', accountHolder: 'primary', recipientName: 'Jane Doe', recipientTaxpayerIdLast4: '6789',
                        basisFactsConfirmed: true, noOtherBasisChangesConfirmed: true, cashDistributionsOnlyConfirmed: true, priorBasisHistoryComplete: true,
                        currentContributions: [{ sourceId: 'gift-1', category: cash ? 'cash_60' : 'capital_gain_30', contributionDate: `${year}-06-01`, contributionShare: cash ? '5000' : '150', adjustedBasisShare: cash ? '5000' : '50', sourceReference: 'Fictional allocated gift statement' }], priorBasisSuspensions: [] },
                    receipts: [{ basisSourceId: 'gift-1', originalBox: '13', originalCode: cash ? 'A' : 'E', recipientName: 'Fictional Public Charity', recipientCategory: 'fifty-percent', qualifiedOrganization: true,
                            donorAdvisedFund: false, supportingOrganization: false, contributionDate: `${year}-06-01`, sourceReference: 'Fictional original receipt',
                            ...(cash ? {} : { propertyType: 'appreciated_stock', acquisitionDate: `${year - 2}-01-01`, fairMarketValueShare: '150', qualifiedAppreciatedStock: true }) }],
                    atRisk: { sourceTaxYear: year, sourceReference: 'Fictional complete activity worksheet', sourceFactsConfirmed: true, simplifiedMethodEligible: true, allActivityDeductionsIncluded: true, computation: 'subsequent_year',
                        adjustedBasisAtEffectiveDate: '0', priorYearAmountAtRisk: '20000', currentYearIncreases: '0', currentYearDecreases: '0',
                        priorLossHistory: { sourceTaxYear: year - 1, sourceReference: 'Fictional known-empty at-risk history', sourceFactsConfirmed: true, vintages: [] } },
                }] } });
}
export function charitableStatement(input: ReturnType<typeof k1CharitableReturnFixture>) {
    const source = input.k1CharitableSources?.statements?.[0];
    if (!source?.basis || !source.atRisk || !source.receipts?.[0])
        throw Error('Missing fictional attached source');
    return source;
}
export function k1CharitableQbiFixture() {
    const input = k1QbiLossSourceInput(), gift = k1CharitableReturnFixture(2025, true), source = charitableStatement(gift), k = input.scheduleK1[0], q = input.qbiLossSources!.activities![0];
    input.w2s = structuredClone(simpleW2Fixture.w2s);
    input.w2s[0].wages = '100000';
    input.w2s[0].federalWithheld = '30000';
    input.standardDeductionFacts = structuredClone(simpleW2Fixture.standardDeductionFacts);
    input.deductionElection = 'itemized';
    Object.assign(k, { ordinaryIncome: '-10000', section199AQBI: '-10000', beginningBasis: '10000', charitableCash: '10000' });
    Object.assign(q.statement!, { ordinaryIncome: '-10000', section199AQBI: '-10000' });
    q.basis!.beginningBasis = '10000';
    q.atRisk!.priorYearAmountAtRisk = '20000';
    k.form6198!.ordinaryIncome = '-5000';
    k.form6198!.priorYearAmountAtRisk = '20000';
    source.basis!.entityName = k.partnershipName;
    source.basis!.entityEIN = k.partnershipEIN;
    source.basis!.recipientName = 'Jordan Source';
    source.basis!.currentContributions![0].contributionShare = '10000';
    source.basis!.currentContributions![0].adjustedBasisShare = '10000';
    input.k1CharitableSources = gift.k1CharitableSources;
    return input;
}
