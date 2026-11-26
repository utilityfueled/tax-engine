// Specs: state/oh-2026-school-native.yaml and state/oh-2026-school-sources.yaml.
import { expect, it } from 'vitest';
import { initialFlowState, saveGuidedFlowState, loadGuidedFlowState, getGuidedFlowStorageKey, updateSectionData, emptyPersonalInfo } from '@/lib/guided-interview-flow';
import { ensureWorkspace } from '@/lib/workspace-storage';
import { exportWorkspaceRecovery, importWorkspaceRecovery, type RecoveryDocumentStore } from '@/lib/workspace-recovery';
import { captureGuidedOhio2026SchoolOriginals, confirmGuidedOhio2026SchoolSource, buildGuidedOhio2026SchoolSource } from '@/lib/guided-ohio-2026-school-sources';
import { ohio2026NativeOriginalFixture, enteredOhio2026SchoolDraft } from '../../fixtures/guided-oh-2026-school-native';
function storage(): Storage { const m = new Map<string, string>(); return { getItem: k => m.get(k) ?? null, setItem: (k, v) => { m.set(k, v); }, removeItem: k => { m.delete(k); }, clear: () => m.clear(), key: n => [...m.keys()][n] ?? null, get length() { return m.size; } }; }
function setup() { const f = ohio2026NativeOriginalFixture(), d = confirmGuidedOhio2026SchoolSource(f.baseInput, captureGuidedOhio2026SchoolOriginals(f.baseInput, enteredOhio2026SchoolDraft())); const state = { ...structuredClone(initialFlowState), taxYear: 2026, sectionData: { 'state-return': { stateEstimatedPayments: [], additionalStateWithholding: '', ohio2026SchoolSources: d } } }; return { f, d, state }; }
it('roundtrips entered school originals without converting unknown facts into zero', async () => { const { f, d, state } = setup(); d.sourceFactsConfirmed = null; const amounts = d.residency.owners[0].amounts; if (!amounts)
    throw Error('Actual category originals required'); amounts.wages.nonresidentOhioAmount = ''; d.employmentOriginals[0].serviceRows[0].wages = '1,0'; const before = structuredClone(d), local = storage(); ensureWorkspace(local, 'school-native'); saveGuidedFlowState(local, 'school-native', state); expect(loadGuidedFlowState(local, 'school-native')?.sectionData['state-return']?.ohio2026SchoolSources).toEqual(before); expect(() => buildGuidedOhio2026SchoolSource(f.baseInput, before)).toThrow(); const documents: RecoveryDocumentStore = { read: async () => null, write: async () => { }, remove: async () => { } }; const archive = await exportWorkspaceRecovery(local, 'school-native', 'fictional-school-recovery-password', { documents }); expect(await archive.text()).not.toContain(d.sourceReference); const restored = await importWorkspaceRecovery(local, archive, 'fictional-school-recovery-password', { documents }); expect(local.getItem(getGuidedFlowStorageKey(restored.workspaceId))).toBe(local.getItem(getGuidedFlowStorageKey('school-native'))); expect(loadGuidedFlowState(local, restored.workspaceId)?.sectionData['state-return']?.ohio2026SchoolSources).toEqual(before); expect(d).toEqual(before); });
it('revokes parent and source changes while preserving retained originals', () => { const { state, d } = setup(); const same = updateSectionData(state, 'state-return', structuredClone(state.sectionData['state-return'])); expect(same.sectionData['state-return']?.ohio2026SchoolSources?.sourceFactsConfirmed).toBe(true); const changed = structuredClone(state.sectionData['state-return']); changed.ohio2026SchoolSources.residence.finder.sourceReference += ' replacement'; const next = updateSectionData(state, 'state-return', changed); expect(next.sectionData['state-return']?.ohio2026SchoolSources?.sourceFactsConfirmed).toBeNull(); expect(next.sectionData['state-return']?.ohio2026SchoolSources?.originalTaxInput).toEqual(d.originalTaxInput); const dependent = updateSectionData(state, 'state-return', { ...state.sectionData['state-return'], additionalStateWithholding: '0' }); expect(dependent.sectionData['state-return']?.ohio2026SchoolSources?.sourceFactsConfirmed).toBeNull(); const parent = updateSectionData(state, 'personal-info', { ...emptyPersonalInfo, firstName: 'Replacement' }); expect(parent.sectionData['state-return']?.ohio2026SchoolSources?.sourceFactsConfirmed).toBeNull(); expect(parent.sectionData['state-return']?.ohio2026SchoolSources?.originalTaxInput).toEqual(d.originalTaxInput); });
it('legacy saved state acquires no new2026 school facts or confirmation', () => { const local = storage(); saveGuidedFlowState(local, 'legacy', initialFlowState); expect(loadGuidedFlowState(local, 'legacy')?.sectionData['state-return']?.ohio2026SchoolSources).toBeUndefined(); });

it.each(['part-year', 'nonresident'] as const)('rejects a %s declaration when confirming or replaying full-year Ohio earned-school originals', stateResidency => {
    const { f, d, state } = setup();
    f.baseInput.taxpayer.stateResidency = stateResidency;
    const captured = captureGuidedOhio2026SchoolOriginals(f.baseInput, d);
    const conflict = /declared status conflicts with actual full-year residency/;
    expect.soft(() => confirmGuidedOhio2026SchoolSource(f.baseInput, captured)).toThrow(conflict);

    // Earlier versions could confirm and store this contradiction with matching snapshots.
    state.sectionData['state-return'].ohio2026SchoolSources = {
        ...captured,
        sourceFactsConfirmed: true,
        originalTaxInput: {
            ...f.baseInput,
            ohioResidency: { ...f.residency, originalFederalSources: captured.originalFederalSources },
        },
    };
    const local = storage();
    expect(saveGuidedFlowState(local, 'school-native', state)).toBe(true);
    const reopened = loadGuidedFlowState(local, 'school-native')?.sectionData['state-return']?.ohio2026SchoolSources;
    expect(reopened?.sourceFactsConfirmed).toBe(true);
    expect(() => buildGuidedOhio2026SchoolSource(f.baseInput, reopened)).toThrow(conflict);
});

it.each(['full-year', undefined] as const)('preserves documentary confirmation for the %s declaration', stateResidency => {
    const { f, state } = setup();
    f.baseInput.taxpayer.stateResidency = stateResidency;
    const captured = captureGuidedOhio2026SchoolOriginals(f.baseInput, enteredOhio2026SchoolDraft());
    state.sectionData['state-return'].ohio2026SchoolSources = confirmGuidedOhio2026SchoolSource(f.baseInput, captured);
    const local = storage();
    expect(saveGuidedFlowState(local, 'school-native', state)).toBe(true);
    const reopened = loadGuidedFlowState(local, 'school-native')?.sectionData['state-return']?.ohio2026SchoolSources;
    expect(buildGuidedOhio2026SchoolSource(f.baseInput, reopened)).toMatchObject({
        districtCode: '0302',
        residentCompensation: '50000',
        schoolWithholding: '625.25',
        taxLiability: null,
        filingQualified: false,
        calculationStatus: 'source-only-incomplete',
    });
});
