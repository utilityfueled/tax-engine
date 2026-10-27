import { k1CharitableAtRiskFixture, k1CharitablePropertyRiskFixture, requireRiskSource } from './k1-charitable-at-risk.js';
import { charitableStatement } from './k1-charitable-return.js';
import { k1QbiLossSourceInput } from './k1-qbi-loss-sources.js';

/** Fictional complete original history; amounts are original sources, not current allowances. */
export function k1PriorCharitableRiskFixture(positiveIncome = false) {
    const input = k1CharitableAtRiskFixture(false, true), source = charitableStatement(input), k = input.scheduleK1[0];
    const risk = requireRiskSource(source.atRisk), q = requireRiskSource(requireRiskSource(input.qbiLossSources).activities)[0];
    const ordinary = positiveIncome ? '10000' : '-40000', gift = positiveIncome ? '0' : '10000';
    const capital = positiveIncome ? '0' : '20000', capacity = positiveIncome ? '5000' : '20000';
    Object.assign(k, { ordinaryIncome: ordinary, section199AQBI: positiveIncome ? '10000' : '0', charitableCash: gift,
        beginningBasis: '50000', netLongTermCapitalGain: capital });
    Object.assign(requireRiskSource(q.statement), { ordinaryIncome: ordinary, section199AQBI: positiveIncome ? '10000' : '0' });
    requireRiskSource(q.basis).beginningBasis = '50000';
    Object.assign(requireRiskSource(q.atRisk), { priorYearAmountAtRisk: capacity, priorSuspendedLoss: '20000', priorLossHistory: {
        sourceTaxYear: 2024, sourceReference: 'Fictional filed QBI465 character ledger', sourceFactsConfirmed: true,
        vintages: [{ taxYear: 2022, originalLoss: '40000', qualifiedOriginalLoss: '40000', remainingLoss: '20000', qualifiedRemainingLoss: '20000', materiallyParticipatedInCurrentYear: true }],
    } });
    Object.assign(requireRiskSource(k.form6198), { ordinaryIncome: positiveIncome ? '-10000' : '-60000',
        gainLossFromDispositions: capital, otherDeductionsLosses: positiveIncome ? '10000' : '20000', priorYearAmountAtRisk: capacity });
    risk.priorYearAmountAtRisk = capacity;
    Object.assign(requireRiskSource(requireRiskSource(source.basis).currentContributions)[0], { contributionShare: gift, adjustedBasisShare: gift });
    const receipt = { ...requireRiskSource(source.receipts)[0], basisSourceId: 'old-cash', contributionDate: '2024-06-01' };
    risk.priorLossHistory = {
        sourceTaxYear: 2024, sourceReference: 'Fictional original2024 Form6198 totals', sourceFactsConfirmed: true,
        vintages: [{ taxYear: 2022, amount: '20000' }, { taxYear: 2024, amount: '10000' }],
        characterSources: { sourceTaxYear: 2024, sourceReference: 'Fictional character and use attachment', sourceFactsConfirmed: true,
            sameOwnerAndActivityConfirmed: true, recipientName: `${input.taxpayer.primary.firstName} ${input.taxpayer.primary.lastName}`,
            recipientTaxpayerIdLast4: input.taxpayer.primary.ssn.replaceAll('-', '').slice(-4),
            entityName: k.partnershipName, entityEIN: k.partnershipEIN,
            records: [
                { sourceId: 'old-ordinary', taxYear: 2022, character: 'ordinary', sourceReference: 'Fictional2022 original ordinary deduction',
                    basisLimitationAlreadyAppliedConfirmed: true, originalPostBasisDeduction: '60000', originalDisallowedAmount: '40000',
                    useHistory: [{ taxYear: 2023, amountAllowed: '10000' }, { taxYear: 2024, amountAllowed: '10000' }] },
                { sourceId: 'old-cash-risk', taxYear: 2024, character: 'charitable', sourceReference: 'Fictional2024 original cash deduction',
                    basisLimitationAlreadyAppliedConfirmed: true, originalPostBasisDeduction: '10000', originalDisallowedAmount: '10000', useHistory: [],
                    gift: { basisSourceId: 'old-cash', basisOriginTaxYear: 2024, category: 'cash_60', contributionShare: '10000', receipt } },
            ],
        },
    };
    requireRiskSource(risk.activityAllocation).charitableSourceIds = ['gift-1', 'old-cash'];
    return input;
}

export function passiveK1PriorRiskFixture(otherIncome = '15000', priorPassive = false) {
    const input = k1PriorCharitableRiskFixture(), k = input.scheduleK1[0], source = charitableStatement(input);
    const q = requireRiskSource(requireRiskSource(input.qbiLossSources).activities)[0];
    Object.assign(k, { isPassiveActivity: true, qbiMateriallyParticipated: false, netLongTermCapitalGain: '0' });
    Object.assign(requireRiskSource(q.statement), { isPassiveActivity: true, qbiMateriallyParticipated: false });
    Object.assign(requireRiskSource(k.form6198), { gainLossFromDispositions: '0', priorYearAmountAtRisk: '40000' });
    requireRiskSource(source.atRisk).priorYearAmountAtRisk = '40000';
    requireRiskSource(q.atRisk).priorYearAmountAtRisk = '40000';
    requireRiskSource(requireRiskSource(requireRiskSource(q.atRisk).priorLossHistory).vintages)[0].materiallyParticipatedInCurrentYear = false;
    if (priorPassive) {
        q.priorPassiveLoss = '10000';
        const prior = requireRiskSource(input.priorYear).suspendedPassiveLosses[0];
        prior.amount = '10000'; requireRiskSource(prior.qbiLossTracking).vintages = [{ taxYear: 2021,
            originalLoss: '10000', qualifiedOriginalLoss: '0', remainingLoss: '10000', qualifiedRemainingLoss: '0',
            materiallyParticipatedInCurrentYear: false }];
    }
    const secondInput = k1QbiLossSourceInput(), second = secondInput.scheduleK1[0];
    const secondSource = requireRiskSource(requireRiskSource(secondInput.qbiLossSources).activities)[0];
    Object.assign(second, { partnershipName: 'Separate actual passive income', partnershipEIN: '98-7654321',
        ordinaryIncome: otherIncome, section199AQBI: '0', isPassiveActivity: true, qbiMateriallyParticipated: false });
    Object.assign(requireRiskSource(second.form6198), { activityName: second.partnershipName, ordinaryIncome: otherIncome });
    Object.assign(secondSource, { k1SourceId: 'scheduleK1:1', entityName: second.partnershipName, entityEIN: second.partnershipEIN });
    Object.assign(requireRiskSource(secondSource.statement), { ordinaryIncome: otherIncome, section199AQBI: '0',
        isPassiveActivity: true, qbiMateriallyParticipated: false });
    input.scheduleK1.push(second); requireRiskSource(requireRiskSource(input.qbiLossSources).activities).push(secondSource);
    requireRiskSource(input.priorYear).suspendedPassiveLosses.push({ ...requireRiskSource(secondInput.priorYear).suspendedPassiveLosses[0], partnershipName: second.partnershipName });
    return input;
}

export function propertyK1PriorRiskFixture() {
    const input = k1CharitablePropertyRiskFixture(), source = charitableStatement(input), k = input.scheduleK1[0];
    const risk = requireRiskSource(source.atRisk);
    const history = requireRiskSource(requireRiskSource(charitableStatement(k1PriorCharitableRiskFixture()).atRisk).priorLossHistory);
    risk.priorLossHistory = { ...history, vintages: [{ taxYear: 2024, amount: '77' }], characterSources: {
        ...requireRiskSource(history.characterSources), entityName: k.partnershipName, entityEIN: k.partnershipEIN,
        recipientName: `${input.taxpayer.primary.firstName} ${input.taxpayer.primary.lastName}`,
        recipientTaxpayerIdLast4: input.taxpayer.primary.ssn.replaceAll('-', '').slice(-4),
        records: [{ sourceId: 'prior-property-risk', taxYear: 2024, character: 'charitable',
            sourceReference: 'Fictional original2024 property deduction', basisLimitationAlreadyAppliedConfirmed: true,
            originalPostBasisDeduction: '154', originalDisallowedAmount: '77', useHistory: [],
            gift: { basisSourceId: 'prior-property', basisOriginTaxYear: 2024, category: 'capital_gain_30',
                contributionShare: '190', adjustedBasisShare: '100', receipt: {
                    ...requireRiskSource(source.receipts)[0], basisSourceId: 'prior-property',
                    contributionDate: '2024-06-01', acquisitionDate: '2020-01-01',
                } },
        }],
    } };
    risk.priorYearAmountAtRisk = '123.50';
    requireRiskSource(risk.activityAllocation).charitableSourceIds = ['gift-1', 'prior-property'];
    Object.assign(requireRiskSource(k.form6198), { otherDeductionsLosses: '231', priorYearAmountAtRisk: '123.50' });
    return input;
}
