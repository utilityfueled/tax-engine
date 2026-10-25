import { TaxYearInputSchema } from '@/models/inputs.js';
import Decimal from 'decimal.js';
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
/** Complete synthetic original character worksheet; never a production default. */
export function qsbsReturnInput(kind: 'broker' | 'fund' = 'broker') {
    const input = qsbsInput(kind);
    return TaxYearInputSchema.parse({ ...input, scheduleDSpecialGainSources: {
            taxYear: 2025, sourceReference: 'Actual synthetic capital worksheet', sourceFactsConfirmed: true,
            allSourcesIncluded: true, primary: { firstName: 'Jane', lastName: 'Doe', ssnLast4: '6789' },
            priorShortTermCapitalLoss: '0', priorLongTermCapitalLoss: '0', section1231Lookback: '0',
            amtBasisAndCarryoversSameAsRegularConfirmed: true, form2439Present: false,
            partnershipInterestDispositionPresent: false, other1250DispositionPresent: false,
            longTermAssets: input.form1099B.flatMap((form, formIndex) => form.transactions.map((trade, index) => ({
                ...trade, sourceId: `form1099B:${formIndex}:transaction:${index}`, sourceTaxYear: 2025,
                sourceReference: 'Actual synthetic trade', accountHolder: 'primary', payerName: form.broker, character: 'qsbs',
            }))),
            reportedGains: input.form1099Div.map((form, index) => ({
                sourceId: `form1099Div:${index}`, sourceTaxYear: 2025, sourceReference: 'Actual synthetic fund statement',
                accountHolder: 'primary', payerName: form.payer, netLongTermCapitalGain: form.totalCapitalGainDistributions,
                collectiblesGain: '0', unrecapturedSection1250Gain: '0', section1202Gain: form.section1202Gain,
            })),
        } });
}
/** Known synthetic 100percent cohort with an original constant1percent fund share. */
export function qsbsFullExclusionFundInput(gain: string, distributions = gain) {
    const input = qsbsReturnInput('fund'), lot = required(required(input.section1202Sources).lots[0]);
    required(input.form1099Div[0]).totalCapitalGainDistributions = distributions;
    required(input.form1099Div[0]).section1202Gain = gain;
    lot.originalIssueDate = '2011-01-02';
    lot.effectiveAcquiredDate = '2011-01-02';
    lot.recognizedGain = gain;
    required(lot.passThrough).entityRecognizedGain = new Decimal(gain).times(100).toFixed();
    required(lot.passThrough).fundCapitalGainDistributions = distributions;
    required(lot.passThrough).fundSection1202Gain = gain;
    required(required(input.scheduleDSpecialGainSources).reportedGains[0]).netLongTermCapitalGain = distributions;
    required(required(input.scheduleDSpecialGainSources).reportedGains[0]).section1202Gain = gain;
    return input;
}

function required<T>(value: T | undefined): T {
  if (value === undefined) throw new Error("Missing complete synthetic QSBS source");
  return value;
}
