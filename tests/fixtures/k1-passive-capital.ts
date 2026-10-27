import { k1CharitableAtRiskFixture, requireRiskSource } from './k1-charitable-at-risk.js';
import { charitableStatement } from './k1-charitable-return.js';
import { k1QbiLossSourceInput } from './k1-qbi-loss-sources.js';
import type { K1CapitalCharacterSources } from '@/models/k1-capital-character-sources.js';

/** Fictional originals: same reported amounts, independently supplied character. */
export function k1PassiveCapitalFixture(character: 'portfolio' | 'passive_activity' = 'passive_activity', otherIncome = '20000') {
    const input = k1CharitableAtRiskFixture(), k = input.scheduleK1[0], statement = charitableStatement(input);
    const q = requireRiskSource(requireRiskSource(input.qbiLossSources).activities)[0];
    Object.assign(k, { ordinaryIncome: '-40000', section199AQBI: '-40000', isPassiveActivity: true, qbiMateriallyParticipated: false,
        beginningBasis: '100000', netShortTermCapitalGain: '10000', netLongTermCapitalGain: '-20000' });
    Object.assign(requireRiskSource(q.statement), { ordinaryIncome: '-40000', section199AQBI: '-40000', isPassiveActivity: true, qbiMateriallyParticipated: false });
    requireRiskSource(q.basis).beginningBasis = '100000';
    requireRiskSource(q.atRisk).priorYearAmountAtRisk = '100000';
    requireRiskSource(statement.atRisk).priorYearAmountAtRisk = '100000';
    Object.assign(requireRiskSource(k.form6198), { ordinaryIncome: '-40000', gainLossFromDispositions: '-10000', priorYearAmountAtRisk: '100000' });
    const facts: K1CapitalCharacterSources = {
        sourceTaxYear: 2025, sourceReference: 'Fictional complete original capital statement', sourceFactsConfirmed: true,
        accountHolder: 'primary', entityName: k.partnershipName, entityEIN: k.partnershipEIN,
        allCapitalItemsIncludedConfirmed: true, ordinaryCapitalTreatmentConfirmed: true, samePassiveActivityConfirmed: true,
        currentShortTerm: { originalAmount: '10000', character, sourceReference: 'Actual original short-term statement' },
        currentLongTerm: { originalAmount: '-20000', character, sourceReference: 'Actual original long-term statement' },
        priorAtRiskCapital: [], priorPassiveCapital: { sourceTaxYear: 2024, sourceReference: 'Actual filed prior capital worksheet',
            sourceFactsConfirmed: true, sameOwnerAndActivityConfirmed: true, shortTermLoss: '0', longTermLoss: '0' },
    };
    statement.capitalCharacter = facts;
    const secondInput = k1QbiLossSourceInput(), second = secondInput.scheduleK1[0];
    const secondSource = requireRiskSource(requireRiskSource(secondInput.qbiLossSources).activities)[0];
    Object.assign(second, { partnershipName: 'Separate actual passive income', partnershipEIN: '98-7654321',
        ordinaryIncome: otherIncome, section199AQBI: '0', isPassiveActivity: true, qbiMateriallyParticipated: false });
    Object.assign(requireRiskSource(second.form6198), { activityName: second.partnershipName, ordinaryIncome: otherIncome });
    Object.assign(secondSource, { k1SourceId: 'scheduleK1:1', entityName: second.partnershipName, entityEIN: second.partnershipEIN });
    Object.assign(requireRiskSource(secondSource.statement), { ordinaryIncome: otherIncome, section199AQBI: '0', isPassiveActivity: true, qbiMateriallyParticipated: false });
    input.scheduleK1.push(second); requireRiskSource(requireRiskSource(input.qbiLossSources).activities).push(secondSource);
    requireRiskSource(input.priorYear).suspendedPassiveLosses.push({ ...requireRiskSource(secondInput.priorYear).suspendedPassiveLosses[0], partnershipName: second.partnershipName });
    return input;
}
