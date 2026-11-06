import type { K1CharitableSourcesData } from '@/lib/guided-k1-charitable-data';
import type { K1LossSourcesData } from '@/lib/guided-qbi-loss-data';
import { guidedK1CharitableAtRiskState } from './guided-k1-charitable-at-risk';
import { k1PriorCharitableRiskFixture } from './k1-prior-charitable-at-risk';
import { requireRiskSource } from './k1-charitable-at-risk';

/** Fictional original records, converted only to their form-control spellings. */
export function guidedK1PriorRiskState() {
    const state = guidedK1CharitableAtRiskState(), input = k1PriorCharitableRiskFixture();
    const personal = requireRiskSource(state.sectionData['personal-info']);
    Object.assign(personal, { firstName: input.taxpayer.primary.firstName, lastName: input.taxpayer.primary.lastName, ssn: input.taxpayer.primary.ssn });
    const strings = (value: unknown): unknown => typeof value === 'number' ? String(value)
        : Array.isArray(value) ? value.map(strings) : value && typeof value === 'object'
            ? Object.fromEntries(Object.entries(value).map(([key, item]) => [key, strings(item)])) : value;
    const q = strings(input.qbiLossSources) as K1LossSourcesData;
    const originalQ = requireRiskSource(requireRiskSource(state.sectionData.adjustments).k1LossSources);
    q.form461Classification = structuredClone(originalQ.form461Classification);
    q.excessBusinessLossHistories = []; q.allExcessBusinessLossHistoriesIncluded = true;
    const activity = requireRiskSource(q.activities)[0];
    Object.assign(activity, { allOtherAmountsZeroConfirmed: false, allOtherNonCharitableAmountsZeroConfirmed: false, domesticNonPtpConfirmed: true,
        passiveHistory: strings(requireRiskSource(input.priorYear).suspendedPassiveLosses[0].qbiLossTracking),
        selfEmploymentTreatment: { sourceTaxYear: '2025', sourceReference: 'Fictional current zero partner earnings record', sourceFactsConfirmed: true,
            method: 'ordinary_current', noOtherPartnerAdjustmentsConfirmed: true,
            priorLossHistory: { sourceTaxYear: '2024', sourceReference: 'Fictional independent zero prior SE record', sourceFactsConfirmed: true, amount: '0' } } });
    const charity = strings(input.k1CharitableSources) as K1CharitableSourcesData;
    const row = requireRiskSource(charity.statements)[0];
    row.original = strings(input.scheduleK1[0]) as typeof row.original;
    requireRiskSource(row.original).federalIncomeTaxWithheld = '0';
    requireRiskSource(row.original).priorSuspendedLosses = { ordinary: '0', charitable: '0' };
    Object.assign(row, { link: 'qbi', qbiSourceId: 'scheduleK1:0', originalSourceReference: 'Fictional original K1 with separate prior history',
        allUnlistedAmountsZeroConfirmed: true, domesticContinuingNonPtpConfirmed: true });
    requireRiskSource(state.sectionData.adjustments).k1LossSources = q;
    requireRiskSource(state.sectionData.deductions).k1CharitableSources = charity;
    return state;
}
