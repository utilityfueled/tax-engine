import { passengerOtherSourceInventories } from '@/lib/guided-passenger-sources';
import type { GuidedPassengerDraft } from '@/lib/guided-passenger-sources';
import { startCompleteInterview, completeBusinessSection } from '../guided-interview/complete-facts';
import { passengerParentFixture } from './passenger-auto-parent';
import type { GuidedFlowState } from '@/lib/guided-interview-flow';
/** Fictional explicit documentary records, never defaults applied to user data. */
type TestDraft = GuidedPassengerDraft & {
    vehicle: Record<string, unknown> & {
        eligibility: Record<string, unknown>;
        mileage: Record<string, unknown>;
        partI: Record<string, unknown>;
    };
    summary: Record<string, unknown>;
    parent: Record<string, unknown> & {
        amounts: {
            expenses: Record<string, unknown>;
        };
        necRows?: unknown;
    };
};
export function passengerNativeFixture(bonus = false) {
    const parent = passengerParentFixture(bonus ? '22000' : '15000', bonus ? '9775' : '8775', '5000', bonus);
    const state = startCompleteInterview({ filingStatus: 'single', incomeTypes: ['self-employment'], lifeEvents: [], stateCode: null });
    state.taxYear = 2026;
    delete state.sectionData.deductions;
    state.sectionData['income-self-employment'] = structuredClone(completeBusinessSection);
    const se = known(state.sectionData['income-self-employment']), facts = known(se.businessFacts);
    se.manualGrossReceipts = bonus ? '22000' : '15000';
    se.expenses.advertising = '2000';
    delete facts.otherExpenseDescription;
    facts.businessInterest = '0';
    facts.scheduleCSourceFacts = { ...known(known(parent.scheduleC).sourceFacts), ownerName: 'Jordan Example', address: { method: 'home_at_return_address', homeAtReturnAddressConfirmed: true, homeReturnAddress: { street: '42 Example Road', city: 'Columbus', state: 'OH', zip: '43215' } } };
    delete facts.scheduleCSourceFacts.passengerFirstYear;
    const form = known(parent.form4562), packet = structuredClone(known(form.passengerFirstYearSources));
    const { originalForm: _o, version: _v, sourceTaxYear: _y, ...vehicle } = packet;
    void _o;
    void _v;
    void _y;
    const proof = structuredClone(known(known(known(parent.scheduleC).sourceFacts).passengerFirstYear));
    const draft: TestDraft = { sourceTaxYear: '2026', otherSources: Object.fromEntries(passengerOtherSourceInventories.map(k => [k, { sourceReference: 'fictional-reviewed-none-' + k, reviewedNoneConfirmed: true }])), vehicle: { ...vehicle, placedInServiceDate: known(form.assets)[0].placedInServiceDate, description: known(form.assets)[0].description, ...Object.fromEntries(['recoveryPeriod', 'method', 'convention', 'isListedProperty', 'isPassengerAutomobile', 'disposedDuringYear', 'section280FRecaptureTriggered', 'firstYearBonusEligible'].map(k => [k, (known(form.assets)[0] as unknown as Record<string, unknown>)[k]])) }, summary: Object.fromEntries(['specialDepreciationAllowance', 'section168f1Depreciation', 'otherDepreciation', 'macrsPre2025AssetsDepreciation', 'macrsCurrentYearGdsDepreciation', 'macrsCurrentYearAdsDepreciation', 'listedPropertyDepreciation', 'currentYearAmortization', 'priorYearAmortization', 'cumulativePriorMacrsDeductions', 'cumulativePriorAdsDeductions'].map(k => [k, '0'])), parent: { sourceReference: proof.sourceReference, assetReference: proof.assetReference, incomeWorksheetReference: proof.incomeWorksheetReference, ledgerReference: proof.ledgerReference, nonNecCashReceipts: proof.nonNecCashReceipts, amounts: proof.amounts, expenseClassifications: proof.expenseClassifications, scope: proof.scope, necRows: [] }, sourceFactsConfirmed: null };
    Object.assign(facts, { depreciationMethod: 'passenger', passengerSources: draft });
    return { state: state as GuidedFlowState, draft, facts, se };
}

function known<T>(value:T|null|undefined):T{if(value===null||value===undefined)throw new Error('Required actual source record is absent');return value;}
