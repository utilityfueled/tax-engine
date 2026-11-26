/** Spec: spec/state/guided-ohio-residency.yaml */
import { it, expect } from 'vitest';
import { ohioResidencyFactErrors, confirmGuidedOhioResidencyFacts, buildGuidedOhioResidencyFacts, guidedOhioUnemploymentStatement, snapshotGuidedOhioOriginals, type OhioResidencyDraft } from '../../apps/web/src/lib/guided-ohio-residency-facts.js';
import { buildTaxInputFromGuidedData } from '@/lib/guided-interview-bridge';
import { confirmGuidedOhioPaymentFacts } from '@/lib/guided-ohio-payment-facts';
import { computeGuidedPreview } from '@/lib/guided-preview-compute';
import { emptyStateReturnData, goToNextSection, jumpToSection, loadGuidedFlowState, saveGuidedFlowState, shouldPromptBeforeAdvance, startInterview, updateSectionData, type GuidedFlowState } from '@/lib/guided-interview-flow';
import { buildGuidedStateOriginals } from '@/lib/guided-state-engine-inputs';
import { calculateFederalTax } from '@/engine/federal';
import { buildOhioResidentReturnInput } from '@/engine/state/oh-input-adapter';
import { calculateOhioResidentReturn } from '@/engine/state/oh-return';
import { TaxYearInputSchema } from '@/models/inputs';
import { ohioResidencyFacts, ohioResidencyOwner } from '../fixtures/oh-residency.js';
import { ohio2026OrdinaryFixture } from '../fixtures/oh-2026-ordinary-return.js';
import { simpleW2Fixture } from '../fixtures/simple-w2.js';
import { unemploymentSource } from '../fixtures/guided-government-uc-original.js';
import { completePersonalInfo, completeW2Entry, startCompleteInterview } from './complete-facts.js';

function required<T>(value: T | null | undefined, description: string): T {
    if (value === null || value === undefined) throw new Error(`Synthetic Ohio fixture requires ${description}`);
    return value;
}

function draft() {
    const f = ohioResidencyFacts();
    const owner = required(f.owners[0], 'the primary owner');
    Object.assign(owner.amounts.wages, { federalAmount: '85000', nonresidentOhioAmount: '20000' });
    return { ...f, taxYear: '2025' } as OhioResidencyDraft;
}

const ohio2026DeclarationCases = [
    ['full_year_resident', 'full-year', 'nonresident', '50000'],
    ['part_year_resident', 'part-year', 'full-year', '30000'],
    ['nonresident', 'nonresident', 'part-year', '10000'],
] as const;

function reopenOhioResidencyGuide(state: GuidedFlowState) {
    const records = new Map<string, string>();
    const storage = {
        getItem: (key: string) => records.get(key) ?? null,
        setItem: (key: string, value: string) => { records.set(key, value); },
        removeItem: (key: string) => { records.delete(key); },
        clear: () => records.clear(),
        key: (index: number) => [...records.keys()][index] ?? null,
        get length() { return records.size; },
    } satisfies Storage;
    expect(saveGuidedFlowState(storage, 'synthetic-ohio-ordinary-residency', state)).toBe(true);
    return required(loadGuidedFlowState(storage, 'synthetic-ohio-ordinary-residency'), 'the saved Ohio guide');
}

it.each(ohio2026DeclarationCases)('rejects a 2026 primary Ohio residency conflict at confirmation and after reopening %s', (status, matching, conflicting, ohioWages) => {
    const fixture = ohio2026OrdinaryFixture(status, '50000', ohioWages);
    const { ohioResidency, ohioPayments: _ohioPayments, ...input } = fixture.input;
    const raw = { ...required(ohioResidency, 'the documentary Ohio residency'), taxYear: '2026', sourceFactsConfirmed: null };
    const matchingInput = { ...input, taxpayer: { ...input.taxpayer, stateResidency: matching } };
    expect(confirmGuidedOhioResidencyFacts(matchingInput, raw).sourceFactsConfirmed).toBe(true);
    expect(confirmGuidedOhioResidencyFacts(input, raw).sourceFactsConfirmed).toBe(true);

    const conflictingInput = { ...input, taxpayer: { ...input.taxpayer, stateResidency: conflicting } };
    const conflict = /declared Ohio residency conflicts with the primary taxpayer's confirmed domicile records/i;
    expect.soft(() => confirmGuidedOhioResidencyFacts(conflictingInput, raw)).toThrow(conflict);

    const state = startInterview({ filingStatus: 'single', incomeTypes: ['w2-wages'], lifeEvents: [], stateCode: 'OH' }, 2026);
    state.sectionData['personal-info'] = { ...completePersonalInfo, stateResidency: conflicting };
    // Model a pre-fix save whose original snapshot already includes the contradictory declaration.
    state.sectionData['state-return'] = { ...emptyStateReturnData, ohioResidency: {
        ...raw, sourceFactsConfirmed: true, originalFederalSources: snapshotGuidedOhioOriginals(conflictingInput),
    } };
    const reopened = reopenOhioResidencyGuide(state);
    const retained = required(reopened.sectionData['state-return']?.ohioResidency, 'the retained Ohio residency');
    expect(reopened.sectionData['personal-info']?.stateResidency).toBe(conflicting);
    expect(retained.sourceFactsConfirmed).toBe(true);
    expect.soft(() => buildGuidedOhioResidencyFacts(retained, conflictingInput)).toThrow(conflict);
    expect.soft(() => buildGuidedStateOriginals(conflictingInput, reopened)).toThrow(conflict);

    reopened.segmentation.stateCode = 'VA';
    expect(buildGuidedStateOriginals(conflictingInput, reopened)).toBe(conflictingInput);
});

it('matches only the primary Ohio declaration on a mixed-residency joint return', () => {
    const fixture = ohio2026OrdinaryFixture('full_year_resident', '50000', '50000', true);
    const { ohioResidency, ohioPayments: _ohioPayments, ...input } = fixture.input;
    const residency = required(ohioResidency, 'the documentary Ohio residency');
    const spouse = required(residency.owners.find(owner => owner.accountHolder === 'spouse'), 'the other documentary owner');
    spouse.status = 'nonresident';
    spouse.periods = [{ from: '2026-01-01', to: '2026-12-31', domicileState: 'VA' }];
    required(spouse.amounts, 'the spouse allocations').wages.residentAmount = '0';
    residency.owners.reverse();
    const raw = { ...residency, taxYear: '2026', sourceFactsConfirmed: null };
    input.taxpayer.stateResidency = 'full-year';
    const confirmed = confirmGuidedOhioResidencyFacts(input, raw);
    expect(buildGuidedOhioResidencyFacts(confirmed, input).owners.map(owner => owner.status)).toEqual(['nonresident', 'full_year_resident']);
    const conflictingInput = { ...input, taxpayer: { ...input.taxpayer, stateResidency: 'nonresident' as const } };
    expect(() => confirmGuidedOhioResidencyFacts(conflictingInput, raw)).toThrow(/declared Ohio residency conflicts/i);
});

it('preserves actual source allocations and copies only confirmed current originals', () => {
    const original = structuredClone(simpleW2Fixture);
    required(original.w2s?.[0], 'an actual W-2').accountHolder = 'primary';
    const facts = buildGuidedOhioResidencyFacts(confirmGuidedOhioResidencyFacts(original, draft()), original);
    const owner = required(facts.owners[0], 'the computed primary owner');
    const amounts = required(owner.amounts, 'actual source allocation amounts');
    expect(amounts.wages.nonresidentOhioAmount).toBe('20000');
    expect(facts.originalFederalSources).toEqual(original);
    expect(facts.originalFederalSources).not.toBe(original);
});

it('requires actual whole-year source facts rather than assuming mailing-address residency', () => {
    expect(ohioResidencyFactErrors(undefined, 2025, 'single')).not.toEqual({});
    const d = draft();
    const owner = required(d.owners[0], 'the primary owner');
    owner.status = 'full_year_resident';
    owner.periods = [{ from: '2025-01-01', to: '2025-12-31', domicileState: 'OH' }];
    expect(ohioResidencyFactErrors(d, 2025, 'single')).toEqual({});
    const actual = buildGuidedOhioResidencyFacts(confirmGuidedOhioResidencyFacts(simpleW2Fixture, d), simpleW2Fixture);
    expect(required(actual.owners[0], 'the computed primary owner').amounts).toBeUndefined();
});

it.each(['blankZero', 'unconfirmed', 'staleYear', 'timelineGap', 'missingSpouse'])('does not manufacture source answers %s', kind => {
    const d = draft();
    const owner = required(d.owners[0], 'the primary owner');
    if (kind === 'blankZero') required(owner.amounts, 'actual source allocation amounts').pensions.federalAmount = '';
    if (kind === 'unconfirmed') d.sourceFactsConfirmed = null;
    if (kind === 'staleYear') d.taxYear = '2024';
    if (kind === 'timelineGap') required(owner.periods[0], 'the actual domicile period').from = '2025-01-02';
    expect(ohioResidencyFactErrors(d, 2025, kind === 'missingSpouse' ? 'married_filing_jointly' : 'single')).not.toEqual({});
    expect(() => buildGuidedOhioResidencyFacts(d, { ...simpleW2Fixture, taxpayer: { ...simpleW2Fixture.taxpayer, filingStatus: kind === 'missingSpouse' ? 'married_filing_jointly' : 'single' } })).toThrow();
});

it('normalizes valid displayed grouping losslessly without manufacturing blank zero', () => {
    const d = draft();
    const amounts = required(required(d.owners[0], 'the primary owner').amounts, 'actual source allocation amounts');
    amounts.wages.federalAmount = '85,000';
    amounts.wages.nonresidentOhioAmount = '20,000';
    const original = structuredClone(simpleW2Fixture);
    required(original.w2s?.[0], 'an actual W-2').accountHolder = 'primary';
    const actual = buildGuidedOhioResidencyFacts(confirmGuidedOhioResidencyFacts(original, d), original);
    const actualAmounts = required(required(actual.owners[0], 'the computed primary owner').amounts, 'computed source allocation amounts');
    expect(actualAmounts.wages.federalAmount).toBe('85000');
    expect(actualAmounts.wages.nonresidentOhioAmount).toBe('20000');
    amounts.pensions.federalAmount = '';
    expect(ohioResidencyFactErrors(d, 2025, 'single')).not.toEqual({});
});

function unemploymentFlow(status: 'part_year_resident' | 'nonresident', partYearBalance = '955') {
    const state = startCompleteInterview({ filingStatus: 'single', incomeTypes: ['w2-wages', 'unemployment'], lifeEvents: [], stateCode: 'OH' });
    state.sectionData['income-w2'] = { entries: [{ ...completeW2Entry, wages: '100000', socialSecurityWages: '100000',
        medicareWages: '100000', sourceTaxYear: '2025', stateTaxReporting: 'single', state: 'OH',
        stateWages: status === 'nonresident' ? '20000' : '40000', stateWithheld: '0' }] };
    state.sectionData['income-unemployment'] = { compensation: '', federalWithheld: '', entries: [{ ...unemploymentSource, compensation: '1000' }] };
    const original = TaxYearInputSchema.parse(buildTaxInputFromGuidedData(state));
    const owner = ohioResidencyOwner('primary', status);
    Object.assign(owner.amounts.wages, { federalAmount: '100000', residentAmount: status === 'nonresident' ? '0' : '30000',
        nonresidentOhioAmount: status === 'nonresident' ? '20000' : '10000' });
    Object.assign(owner.amounts.unemployment, { federalAmount: '1000', residentAmount: status === 'nonresident' ? '0' : '1000' });
    const ohioResidency: OhioResidencyDraft = { ...ohioResidencyFacts(), taxYear: '2025', owners: [owner],
        originalFederalSources: snapshotGuidedOhioOriginals(original) };
    const ohioPayments = confirmGuidedOhioPaymentFacts(original, {
        taxYear: '2025', sourceReference: 'Synthetic completed Ohio account', sourceFactsConfirmed: true,
        calendarYearConfirmed: true, allPaymentsIncludedConfirmed: true, returnKind: 'original', paymentRows: [],
        priorReturn: { status: 'no_return', sourceReference: 'Synthetic no prior Ohio return' },
        priorCreditCarryforward: { status: 'none', sourceReference: 'Synthetic account credit records' },
        currentTiming: { kind: 'expected', expectedDate: '2026-04-15', asOfDate: '2026-04-01' },
        remainingTaxPayment: { status: 'expected_payment', sourceReference: 'Synthetic planned balance payment',
            date: '2026-04-15', sourceFactsConfirmed: true, amountAppliedToTax: status === 'nonresident' ? '466' : partYearBalance },
        filingExtension: { kind: 'none' }, paymentExtension: { kind: 'none' },
        specialFacts: { farmingFishingIncome: 'known_none', militaryDisasterRelief: 'known_none' },
        balanceFacts: { sourceReference: 'Synthetic actual balance facts', useTax: '0', outgoingCarryforward: '0', donations: '0' },
    });
    state.sectionData['state-return'] = { ...emptyStateReturnData, ohioResidency, ohioPayments };
    return { state: jumpToSection(state, 'state-return'), original, residency: ohioResidency, payments: ohioPayments };
}

it('replays a complete split unemployment payment schedule through the guided Ohio return', () => {
    const { state, original, residency } = unemploymentFlow('part_year_resident', '945');
    const statement = required(guidedOhioUnemploymentStatement(original), 'the current unemployment statement');
    const schedule = {
        originalStatementFingerprint: statement.fingerprint,
        allPaymentsIncludedConfirmed: true,
        payments: [
            { sourceReference: 'Synthetic June original receipt', paidOrAccruedOn: '2025-06-30', amount: '400.00' },
            { sourceReference: 'Synthetic July original receipt', paidOrAccruedOn: '2025-07-01', amount: '600.00' },
        ],
    };
    const stateReturn = required(state.sectionData['state-return'], 'actual Ohio state drafts');
    const invalid = { ...residency, unemploymentPaymentSchedule: { ...schedule, allPaymentsIncludedConfirmed: false } };
    expect(() => confirmGuidedOhioResidencyFacts(original, invalid)).toThrow(/complete dated unemployment/i);
    const edited = updateSectionData(state, 'state-return', {
        ...stateReturn, ohioResidency: { ...residency, unemploymentPaymentSchedule: schedule },
    });
    const editedReturn = required(edited.sectionData['state-return'], 'edited receipt schedule');
    const confirmed = confirmGuidedOhioResidencyFacts(original, editedReturn.ohioResidency);
    const reopened: typeof state = JSON.parse(JSON.stringify(updateSectionData(edited, 'state-return', { ...editedReturn, ohioResidency: confirmed })));
    const saved = required(reopened.sectionData['state-return']?.ohioResidency, 'saved receipt schedule');
    const actual = buildGuidedOhioResidencyFacts(saved, original);

    expect(saved.unemploymentPaymentSchedule).toEqual(schedule);
    expect(actual.unemploymentPaymentSchedule?.originalSourceId).toBe(statement.sourceId);
    expect(actual.owners[0]?.amounts?.unemployment.residentAmount).toBe('600');
    expect(shouldPromptBeforeAdvance(reopened)).toBeNull();
    expect(computeGuidedPreview(reopened)?.state).toMatchObject({ stateCode: 'OH' });

    const replacement = structuredClone(original);
    required(replacement.form1099G?.[0], 'replacement unemployment statement').accountReference = 'Synthetic updated statement with the same Box 1';
    expect(() => confirmGuidedOhioResidencyFacts(replacement, saved)).toThrow(/1099-G was replaced or changed/i);
});

it('requires actual unemployment evidence before Ohio wizard progression and replays saved originals', () => {
    const { state, original, residency } = unemploymentFlow('part_year_resident');
    expect(shouldPromptBeforeAdvance(state)).toMatchObject({ status: 'partial', allowSkip: false });
    expect(computeGuidedPreview(state)?.state).toBeNull();
    const statement = required(guidedOhioUnemploymentStatement(original), 'the current unemployment statement');
    const proof = {
        originalStatementFingerprint: statement.fingerprint, sourceReference: 'Synthetic actual payment record',
        paidOrAccruedOn: '2025-07-01', amount: '1,000.00', allPaymentsIncludedConfirmed: true,
    };
    const stateReturn = required(state.sectionData['state-return'], 'actual Ohio state drafts');
    for (const change of [
        { sourceReference: '' }, { amount: '999.99' }, { paidOrAccruedOn: '2025-02-29' },
        { paidOrAccruedOn: '2026-01-01' }, { allPaymentsIncludedConfirmed: false },
    ]) {
        const ohioResidency = { ...residency, unemploymentPaymentSource: { ...proof, ...change } };
        const incomplete = { ...state, sectionData: { ...state.sectionData, 'state-return': { ...stateReturn, ohioResidency } } };
        expect(shouldPromptBeforeAdvance(incomplete), JSON.stringify(change)).toMatchObject({ status: 'partial', allowSkip: false });
        expect(computeGuidedPreview(incomplete)?.state).toBeNull();
        expect(() => confirmGuidedOhioResidencyFacts(original, ohioResidency)).toThrow(/unemployment/i);
    }

    const edited = updateSectionData(state, 'state-return', { ...stateReturn,
        ohioResidency: { ...residency, unemploymentPaymentSource: proof } });
    const editedReturn = required(edited.sectionData['state-return'], 'the edited Ohio source drafts');
    expect(editedReturn.ohioResidency?.sourceFactsConfirmed).toBeNull();
    const confirmed = updateSectionData(edited, 'state-return', { ...editedReturn,
        ohioResidency: confirmGuidedOhioResidencyFacts(original, editedReturn.ohioResidency) });
    const records = new Map<string, string>();
    const storage: Storage = {
        get length() { return records.size; }, clear: () => records.clear(), key: index => [...records.keys()][index] ?? null,
        getItem: key => records.get(key) ?? null, setItem: (key, value) => { records.set(key, value); },
        removeItem: key => { records.delete(key); },
    };
    expect(saveGuidedFlowState(storage, 'synthetic-ohio-unemployment', confirmed)).toBe(true);
    const reopened = required(loadGuidedFlowState(storage, 'synthetic-ohio-unemployment'), 'the reopened Ohio route');
    const retained = required(reopened.sectionData['state-return']?.ohioResidency, 'the retained Ohio residency draft');
    expect(retained.unemploymentPaymentSource).toEqual(proof);
    expect(shouldPromptBeforeAdvance(reopened)).toBeNull();
    expect(goToNextSection(reopened).completedSections).toContain('state-return');
    expect(computeGuidedPreview(reopened)?.state).toMatchObject({ stateCode: 'OH', stateTax: '999' });
    const facts = buildGuidedOhioResidencyFacts(retained, original);
    expect(facts.unemploymentPaymentSource).toMatchObject({ originalSourceId: statement.sourceId, amount: '1000.00' });
    const canonical = calculateOhioResidentReturn(buildOhioResidentReturnInput({ ...original, ohioResidency: facts }, calculateFederalTax(original)));
    expect(canonical.nonresidentCreditResult?.line12.toFixed()).toBe('1000');
    expect(canonical.nonresidentCreditResult?.line20.toFixed()).toBe('1396');

    const replacement = updateSectionData(reopened, 'income-unemployment', { compensation: '', federalWithheld: '',
        entries: [{ ...unemploymentSource, compensation: '1000', accountReference: 'Same value replacement statement' }] });
    const replacementInput = TaxYearInputSchema.parse(buildTaxInputFromGuidedData(replacement));
    expect(guidedOhioUnemploymentStatement(replacementInput)?.sourceId).toBe(statement.sourceId);
    expect(shouldPromptBeforeAdvance(replacement)).toMatchObject({ status: 'partial', allowSkip: false });
    expect(computeGuidedPreview(replacement)?.state).toBeNull();
    expect(() => confirmGuidedOhioResidencyFacts(replacementInput, retained)).toThrow(/1099-G was replaced or changed/i);
    const personal = required(reopened.sectionData['personal-info'], 'the original primary identity');
    const syntheticReplacementTaxId = '444-55-6666';
    const anotherOwner = updateSectionData(reopened, 'personal-info', { ...personal, ssn: syntheticReplacementTaxId });
    expect(shouldPromptBeforeAdvance(anotherOwner)).toMatchObject({ status: 'partial', allowSkip: false });
    expect(computeGuidedPreview(anotherOwner)?.state ?? null).toBeNull();
    const anotherInput = structuredClone(original);
    anotherInput.taxpayer.primary.ssn = syntheticReplacementTaxId;
    expect(() => confirmGuidedOhioResidencyFacts(anotherInput, retained)).toThrow(/unemployment owner changed/i);
    const sameOwner = structuredClone(original);
    sameOwner.taxpayer.primary.firstName = 'J. Example';
    expect(confirmGuidedOhioResidencyFacts(sameOwner, retained).unemploymentPaymentSource).toEqual(proof);
    expect(() => confirmGuidedOhioResidencyFacts(original, { ...retained, sourceReference: 'Updated domicile record' })).not.toThrow();
});

it('derives full-year nonresident unemployment without asking for payment evidence', () => {
    const { state, original, residency } = unemploymentFlow('nonresident');
    const amounts = required(required(residency.owners[0], 'the primary owner').amounts, 'actual source categories');
    amounts.unemployment = { federalAmount: '', residentAmount: '', nonresidentOhioAmount: '', sourceReference: '' };
    const ohioResidency = buildGuidedOhioResidencyFacts(confirmGuidedOhioResidencyFacts(original, residency), original);
    expect(ohioResidency.unemploymentPaymentSource).toBeUndefined();
    expect(ohioResidency.owners[0]?.amounts?.unemployment).toMatchObject({ federalAmount: '1000', residentAmount: '0', nonresidentOhioAmount: '0' });
    expect(shouldPromptBeforeAdvance(state)).toBeNull();
    expect(computeGuidedPreview(state)?.state).toMatchObject({ stateCode: 'OH', stateTax: '466' });
});
