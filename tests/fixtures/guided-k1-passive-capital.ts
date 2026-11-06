import type { K1CharitableSourcesData } from '@/lib/guided-k1-charitable-data';
import type { K1LossSourcesData } from '@/lib/guided-qbi-loss-data';
import { guidedK1CharitableAtRiskState } from './guided-k1-charitable-at-risk';
import { k1PassiveCapitalFixture } from './k1-passive-capital';
import { requireRiskSource } from './k1-charitable-at-risk';

/** Fictional original statements; only source years become form-control strings. */
export function guidedK1PassiveCapitalState(priorCapital = '0') {
    const state = guidedK1CharitableAtRiskState(), input = k1PassiveCapitalFixture('passive_activity', '0');
    const personal = requireRiskSource(state.sectionData['personal-info']);
    Object.assign(personal, { firstName: input.taxpayer.primary.firstName, lastName: input.taxpayer.primary.lastName, ssn: input.taxpayer.primary.ssn });
    const strings = (value: unknown): unknown => typeof value === 'number' ? String(value)
        : Array.isArray(value) ? value.map(strings) : value && typeof value === 'object'
            ? Object.fromEntries(Object.entries(value).map(([key, item]) => [key, strings(item)])) : value;
    const q = strings(input.qbiLossSources) as K1LossSourcesData;
    q.excessBusinessLossHistories = []; q.allExcessBusinessLossHistoriesIncluded = true;
    requireRiskSource(q.activities).forEach((activity, index) => {
        Object.assign(activity, { allOtherAmountsZeroConfirmed: index !== 0,
            ...(index === 0 ? { allOtherNonCharitableAmountsZeroConfirmed: false } : {}), domesticNonPtpConfirmed: true,
            passiveHistory: strings(requireRiskSource(input.priorYear).suspendedPassiveLosses[index].qbiLossTracking),
            selfEmploymentTreatment: { sourceTaxYear: '2025', sourceReference: 'Fictional original zero current partner earnings', sourceFactsConfirmed: true,
                method: 'ordinary_current', noOtherPartnerAdjustmentsConfirmed: true,
                priorLossHistory: { sourceTaxYear: '2024', sourceReference: 'Fictional separately filed zero SE history', sourceFactsConfirmed: true, amount: '0' } } });
    });
    const charity = strings(input.k1CharitableSources) as K1CharitableSourcesData;
    const row = requireRiskSource(charity.statements)[0];
    row.original = strings(input.scheduleK1[0]) as typeof row.original;
    requireRiskSource(row.original).federalIncomeTaxWithheld = '0';
    requireRiskSource(row.original).priorSuspendedLosses = { ordinary: '0', charitable: '0' };
    Object.assign(row, { link: 'qbi', qbiSourceId: 'scheduleK1:0', originalSourceReference: 'Fictional complete original capital K1',
        allUnlistedAmountsZeroConfirmed: true, domesticContinuingNonPtpConfirmed: true });
    requireRiskSource(requireRiskSource(row.capitalCharacter).priorPassiveCapital).shortTermLoss = priorCapital;
    requireRiskSource(state.sectionData.adjustments).k1LossSources = q;
    requireRiskSource(state.sectionData.deductions).k1CharitableSources = charity;
    return state;
}
