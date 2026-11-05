// spec/federal/passenger-native-source-collector.yaml#native-route
import { expect, it } from 'vitest';
import * as bridge from '@/lib/guided-interview-bridge';
import { TaxYearInputSchema } from '@/models/inputs';
import { calculateScheduleC } from '@/engine/schedules/schedule-c';
import { passengerNativeFixture } from '../../fixtures/passenger-native';
for (const [bonus, expected] of [[false, '3775'], [true, '4775']] as const)
    it(`native bridge preserves documented ${bonus ? 'bonus' : 'ordinary'} parent net ${expected}`, () => {
        const f = passengerNativeFixture(bonus);
        const capture = (bridge as unknown as {
            captureGuidedPassengerSources?: (s: typeof f.state) => unknown;
        }).captureGuidedPassengerSources;
        if (capture)
            Object.assign(f.facts, { passengerSources: capture(f.state) });
        const raw = bridge.buildTaxInputFromGuidedData(f.state);
        expect(raw).not.toBeNull();
        const input = TaxYearInputSchema.parse(raw);
        expect(calculateScheduleC(input, input.scheduleC).netProfit.toString()).toBe(expected);
    });
import { vi } from 'vitest';
import { updateSectionData, saveGuidedFlowState, loadGuidedFlowState, getGuidedFlowStorageKey } from '@/lib/guided-interview-flow';
import { buildGuidedPassengerForm, bindGuidedPassengerInput } from '@/lib/guided-passenger-sources';
import { PassengerAutoParentSourcesSchema } from '@/models/passenger-auto-parent-sources';
import { calculateScheduleCPassengerSources } from '@/engine/schedules/schedule-c-passenger-first-year-sources';
import { completeNecSource } from '../../guided-interview/complete-facts';
import { ensureWorkspace, getWorkspace } from '@/lib/workspace-storage';
import { exportWorkspaceRecovery, importWorkspaceRecovery } from '@/lib/workspace-recovery';
import { sanitizeWorkspaceForHostedStorage } from '@/lib/hosted-privacy';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { PassengerSourceDetails } from '@/components/guided-interview/passenger-source-details';
function confirmed(bonus = false) { const f = passengerNativeFixture(bonus); f.facts.passengerSources = bridge.captureGuidedPassengerSources(f.state); return f; }
function storage(): Storage { const v = new Map<string, string>(); return { getItem: k => v.get(k) ?? null, setItem: (k, x) => { v.set(k, x); }, removeItem: k => { v.delete(k); }, clear: () => v.clear(), key: n => [...v.keys()][n] ?? null, get length() { return v.size; } }; }
it('captures immutable full native originals without mutating the interview or inventing a provisional tax input', () => {
    const f = passengerNativeFixture(), before = JSON.stringify(f.state), d = bridge.captureGuidedPassengerSources(f.state);
    expect(JSON.stringify(f.state)).toBe(before);
    expect(d.originalInput).toBeDefined();
    expect(d.originalDraft).toBeDefined();
    expect(d).not.toHaveProperty('input');
    expect(bridge.buildTaxInputFromGuidedData(f.state)).toBeNull();
    f.facts.passengerSources = d;
    const input = TaxYearInputSchema.parse(bridge.buildTaxInputFromGuidedData(f.state));
    const native = known(known(known(known(input.scheduleC).sourceFacts).passengerFirstYear).originalNativeContext);
    expect(native.standardDeductionFacts.primaryCanBeClaimedAsDependent).toBe(false);
    expect(native.deductionElection).toBe('automatic');
    expect(native.formSSA1099).toEqual([]);
    expect(native.childTaxCredit?.form4563ExcludedIncome).toBe('0');
    expect(JSON.stringify(calculateScheduleC(input, input.scheduleC).lines)).not.toContain('private-parent-source');
});
it.each(['invoiceReference', 'purchaseContractReference', 'eligibilityReference', 'mileageReference', 'electionReference', 'partIReference', 'inventoryReference'])('rejects a stale reference-only %s edit even with equal money', key => { const f = confirmed(), before = structuredClone(known(f.facts.passengerSources).originalDraft); f.draft.vehicle[key] = 'changed-same-cash-original'; expect(bridge.buildTaxInputFromGuidedData(f.state)).toBeNull(); expect(known(f.facts.passengerSources).originalDraft).toEqual(before); });
it.each(['businessMiles', 'commutingMiles', 'otherPersonalMiles', 'totalMiles'])('never fills missing actual %s from percentage or totals', key => { const f = passengerNativeFixture(); (f.draft.vehicle.mileage as Record<string, unknown>)[key] = ''; expect(() => bridge.captureGuidedPassengerSources(f.state)).toThrow(); });
it.each(['allowedSection179', 'maximum', 'threshold', 'totalCost', 'electedCost', 'businessIncomeLimit', 'priorCarryover', 'nextCarryover'])('requires actual completed PartI %s including each zero', key => { const f = passengerNativeFixture(); (f.draft.vehicle.partI as Record<string, unknown>)[key] = undefined; expect(() => bridge.captureGuidedPassengerSources(f.state)).toThrow(); });
it('admits independently documented known zero179 but refuses unknown instead', () => { const f = passengerNativeFixture(), pi = f.draft.vehicle.partI as Record<string, unknown>; Object.assign(pi, { allowedSection179: '0', electedCost: '0', businessIncomeLimit: '3775' }); f.facts.passengerSources = bridge.captureGuidedPassengerSources(f.state); const i = TaxYearInputSchema.parse(bridge.buildTaxInputFromGuidedData(f.state)); expect(calculateScheduleC(i, i.scheduleC).netProfit.toString()).toBe('3775'); expect(known(i.form4562).section179ExpenseDeduction).toBe('0'); delete pi.priorCarryover; expect(() => bridge.captureGuidedPassengerSources(f.state)).toThrow(); });
it.each(['otherDepreciation', 'listedPropertyDepreciation', 'cumulativePriorAdsDeductions'])('requires explicit summary/history %s instead of canonical defaults', key => { const f = passengerNativeFixture(); delete f.draft.summary[key]; expect(() => bridge.captureGuidedPassengerSources(f.state)).toThrow(); });
it.each(['depletion', 'bankCharges', 'carAndTruck'])('requires actual all-other-expense zero classification %s', key => { const f = passengerNativeFixture(); delete (f.draft.parent.amounts.expenses as Record<string, unknown>)[key]; expect(() => bridge.captureGuidedPassengerSources(f.state)).toThrow(); });
it('derives eligibility from originals despite a supplied confirmed UI claim', () => { for (const change of [(f: ReturnType<typeof passengerNativeFixture>) => { f.draft.vehicle.unloadedVehicleWeightPounds = '7000'; }, (f: ReturnType<typeof passengerNativeFixture>) => { f.draft.vehicle.businessUsePercentage = '50'; }, (f: ReturnType<typeof passengerNativeFixture>) => { f.draft.vehicle.placedInServiceDate = '2026-10-01'; }, (f: ReturnType<typeof passengerNativeFixture>) => { f.draft.vehicle.eligibility.noAlternativeMileageMethod = false; }, (f: ReturnType<typeof passengerNativeFixture>) => { f.draft.vehicle.eligibility.newOriginalUse = null; }]) {
    const f = passengerNativeFixture();
    change(f);
    f.draft.sourceFactsConfirmed = true;
    expect(() => bridge.captureGuidedPassengerSources(f.state)).toThrow();
    expect(bridge.buildTaxInputFromGuidedData(f.state)).toBeNull();
} });
it('covers actual NEC and nonNEC exactly once and binds each original reference and row', () => { const f = passengerNativeFixture(); f.se.manualGrossReceipts = '10000'; f.se.necEntries = [{ ...completeNecSource, sourceTaxYear: '2026', nonemployeeCompensation: '5000' }]; f.draft.parent.nonNecCashReceipts = '10000'; f.draft.parent.necRows = [{ index: 0, sourceReference: 'fictional-client-original', confirmed: true, actualSameBusinessCashServicesConfirmed: true }]; f.facts.passengerSources = bridge.captureGuidedPassengerSources(f.state); const i = TaxYearInputSchema.parse(bridge.buildTaxInputFromGuidedData(f.state)); expect(i.form1099Nec).toHaveLength(1); expect(calculateScheduleC(i, i.scheduleC).grossReceipts.toString()).toBe('15000'); expect(calculateScheduleC(i, i.scheduleC).netProfit.toString()).toBe('3775'); f.se.necEntries[0].payerTin = '98-7654321'; expect(bridge.buildTaxInputFromGuidedData(f.state)).toBeNull(); f.se.manualGrossReceipts = '15000'; expect(() => bridge.captureGuidedPassengerSources(f.state)).toThrow(); });
it('rejects absent duplicate out-of-order or unknown NEC inventory evidence', () => { for (const rows of [undefined, [], [{ index: 1, sourceReference: 'ref', confirmed: true, actualSameBusinessCashServicesConfirmed: true }], [{ index: 0, sourceReference: 'ref', confirmed: true, actualSameBusinessCashServicesConfirmed: true, originalRecord: {} }]]) {
    const f = passengerNativeFixture();
    f.se.manualGrossReceipts = '10000';
    f.se.necEntries = [{ ...completeNecSource, sourceTaxYear: '2026', nonemployeeCompensation: '5000' }];
    f.draft.parent.nonNecCashReceipts = '10000';
    f.draft.parent.necRows = rows;
    expect(() => bridge.captureGuidedPassengerSources(f.state)).toThrow();
} });
it('keeps owner year income and business-method boundaries', () => { for (const mutate of [(f: ReturnType<typeof passengerNativeFixture>) => { f.state.taxYear = 2025; }, (f: ReturnType<typeof passengerNativeFixture>) => { f.facts.accountHolder = 'spouse'; }, (f: ReturnType<typeof passengerNativeFixture>) => { f.facts.accountingMethod = 'accrual'; }, (f: ReturnType<typeof passengerNativeFixture>) => { f.se.manualGrossReceipts = '15001'; }, (f: ReturnType<typeof passengerNativeFixture>) => { f.facts.macrsAssets = {}; }, (f: ReturnType<typeof passengerNativeFixture>) => { f.facts.depreciationMethod = 'manual'; }]) {
    const f = confirmed();
    mutate(f);
    expect(bridge.buildTaxInputFromGuidedData(f.state)).toBeNull();
} });
it('retains incompatible native contexts rather than silently dropping facts', () => { const f = confirmed(); for (const key of ['primaryBlind', 'primaryCanBeClaimedAsDependent', 'nonresidentAlien', 'shortTaxYear'] as const) {
    const x = structuredClone(f.state);
    known(known(x.sectionData['personal-info']).standardDeductionFacts)[key] = true;
    expect(bridge.buildTaxInputFromGuidedData(x)).toBeNull();
} const i = TaxYearInputSchema.parse(bridge.buildTaxInputFromGuidedData(f.state)); for (const extra of [{ adjustments: { alimonyPaid: '0' } }, { eic: { primaryIsFullTimeStudent: false } }, { form1099R: [{ grossDistribution: '0' }] }, { standardDeductionFacts: { ...i.standardDeductionFacts, dependentEarnedIncome: '0' } }, { deductionElection: 'itemized' }]) {
    const x = { ...i, ...extra };
    expect(() => calculateScheduleCPassengerSources(x, x.scheduleC)).toThrow();
} });
it('keeps compatible standard selection but requires actual full context recapture after edits', () => { const f = confirmed(), original = structuredClone(known(f.facts.passengerSources).originalInput); const next = updateSectionData(f.state, 'deductions', { method: 'standard' }); expect(known(known(known(next.sectionData['income-self-employment']).businessFacts).passengerSources).sourceFactsConfirmed).toBeNull(); expect(known(known(known(next.sectionData['income-self-employment']).businessFacts).passengerSources).originalInput).toEqual(original); expect(bridge.buildTaxInputFromGuidedData(next)).toBeNull(); const se = known(next.sectionData['income-self-employment']); known(se.businessFacts).passengerSources = bridge.captureGuidedPassengerSources(next); expect(bridge.buildTaxInputFromGuidedData(next)?.deductionElection).toBe('standard'); });
it('treats capture metadata as metadata and revokes actual source edits without rebasing', () => { const f = passengerNativeFixture(), d = bridge.captureGuidedPassengerSources(f.state); const next = updateSectionData(f.state, 'income-self-employment', { ...f.se, businessFacts: { ...f.facts, passengerSources: d } }); expect(known(known(known(next.sectionData['income-self-employment']).businessFacts).passengerSources).sourceFactsConfirmed).toBe(true); expect(bridge.buildTaxInputFromGuidedData(next)).not.toBeNull(); const changed = updateSectionData(next, 'personal-info', { ...known(next.sectionData['personal-info']), firstName: 'New owner' }); expect(known(known(known(changed.sectionData['income-self-employment']).businessFacts).passengerSources).sourceFactsConfirmed).toBeNull(); expect(known(known(known(changed.sectionData['income-self-employment']).businessFacts).passengerSources).originalInput).toEqual(d.originalInput); });
it('retains blanks, zero and originals through local reload and actual encrypted recovery while hosted shell stays private', async () => { const f = confirmed(), local = storage(); ensureWorkspace(local, 'one'); ensureWorkspace(local, 'unrelated'); known(known(f.facts.passengerSources).vehicle).grossCostBasis = ''; known(known(f.facts.passengerSources).summary).otherDepreciation = '0.00'; known(f.facts.passengerSources).sourceFactsConfirmed = null; saveGuidedFlowState(local, 'one', f.state); expect(known(known(known(loadGuidedFlowState(local, 'one')).sectionData['income-self-employment']).businessFacts).passengerSources).toEqual(f.facts.passengerSources); expect(bridge.buildTaxInputFromGuidedData(known(loadGuidedFlowState(local, 'one')))).toBeNull(); const documents = { read: vi.fn(async () => null), write: vi.fn(async () => { }), remove: vi.fn(async () => { }) }; const archive = await exportWorkspaceRecovery(local, 'one', 'fictional-passenger-recovery', { documents }); expect(await archive.text()).not.toMatch(/private-parent-source|grossCostBasis|passengerSources/); const restored = await importWorkspaceRecovery(local, archive, 'fictional-passenger-recovery', { documents }); expect(local.getItem(getGuidedFlowStorageKey(restored.workspaceId))).toBe(local.getItem(getGuidedFlowStorageKey('one'))); expect(local.getItem(getGuidedFlowStorageKey('unrelated'))).toBeNull(); const unsafeWorkspace = { ...known(getWorkspace(local, 'one')), passengerSources: f.facts.passengerSources, guidedFlowRaw: JSON.stringify(f.state) }; expect(JSON.stringify(sanitizeWorkspaceForHostedStorage(unsafeWorkspace))).not.toMatch(/passengerSources|private-parent-source|grossCostBasis|originalInput/); });
it('exposes all documentary groups without checked defaults or automatic source capture', () => { const capture = vi.fn(); const html = renderToStaticMarkup(createElement(PassengerSourceDetails, { onChange: vi.fn(), onCapture: capture })); expect(html).toContain('Actual completed Form 4562 Part I'); expect(html).toContain('Capture and confirm complete passenger sources'); expect(html).not.toContain('checked=""'); expect(capture).not.toHaveBeenCalled(); expect(html).toContain('Record reviewed empty NEC inventory'); expect(html).toContain('Add actual expense classification'); });
it('keeps finite native context and parent proof schemas strict', () => { const f = confirmed(), i = TaxYearInputSchema.parse(bridge.buildTaxInputFromGuidedData(f.state)), p = known(known(known(i.scheduleC).sourceFacts).passengerFirstYear); expect(PassengerAutoParentSourcesSchema.safeParse({ ...p, originalNativeContext: { ...p.originalNativeContext, ignoredIncome: '0' } }).success).toBe(false); expect(() => bindGuidedPassengerInput({ ...i, unclassifiedNativeFacts: { amount: '0' } }, f.facts, true)).toThrow(); expect(() => buildGuidedPassengerForm({ ...f.facts, passengerSources: { ...known(f.facts.passengerSources), vehicle: { ...known(f.facts.passengerSources).vehicle, standardMileageUsed: true } } }, 2026)).toThrow(); });
it('requires every original no-other-source row rather than default empty arrays', () => { for (const field of ['w2s', 'form1099R', 'formSSA1099', 'formRRB1099', 'form1099Int', 'rentalProperties']) {
    const f = passengerNativeFixture();
    delete known(f.draft.otherSources)[field];
    expect(() => bridge.captureGuidedPassengerSources(f.state)).toThrow();
} const f = confirmed(); known(known(f.facts.passengerSources).otherSources).w2s.sourceReference = 'changed-reference-only'; expect(bridge.buildTaxInputFromGuidedData(f.state)).toBeNull(); });

function known<T>(value:T|null|undefined):T{if(value===null||value===undefined)throw new Error('Required actual source record is absent');return value;}

it('keeps production2026 review and filing exports unavailable after native capture', async()=>{const {assertPdfExportAllowed,PDF_MAPPING_PACKS}=await import('@/pdf/export-policy');const f=confirmed(),i=TaxYearInputSchema.parse(bridge.buildTaxInputFromGuidedData(f.state));expect(calculateScheduleC(i,i.scheduleC).netProfit.toString()).toBe('3775');expect(PDF_MAPPING_PACKS[2026].reviewAvailable).toBe(false);expect(PDF_MAPPING_PACKS[2026].filingQualified).toBe(false);expect(()=>assertPdfExportAllowed(2026,2026,'review')).toThrow();expect(()=>assertPdfExportAllowed(2026,2026,'filing')).toThrow();});
it('never overwrites a conflicting actual canonical form during documentary capture',()=>{const f=confirmed(),input=TaxYearInputSchema.parse(bridge.buildTaxInputFromGuidedData(f.state));const raw=structuredClone(input);if(raw.scheduleC?.sourceFacts)delete raw.scheduleC.sourceFacts.passengerFirstYear;if(raw.form4562?.assets?.[0])raw.form4562.assets[0].costBasis='90000';expect(()=>bindGuidedPassengerInput(raw,f.facts,true)).toThrow();});
it('retains no-other-source documentary references in the actual canonical parent packet',()=>{const f=confirmed(),i=TaxYearInputSchema.parse(bridge.buildTaxInputFromGuidedData(f.state)),p=i.scheduleC?.sourceFacts?.passengerFirstYear;expect((p as unknown as Record<string,unknown>)?.nativeOtherSources).toEqual(f.draft.otherSources);});
it('preserves actual incomplete2026 whole-return calculation denial after native source handoff',async()=>{const {calculateFederalTax}=await import('@/engine/federal');for(const[bonus,expected]of [[false,'3775'],[true,'4775']] as const){const f=confirmed(bonus),i=TaxYearInputSchema.parse(bridge.buildTaxInputFromGuidedData(f.state)),before=JSON.stringify(i);expect(calculateScheduleC(i,i.scheduleC).netProfit.toString()).toBe(expected);expect(()=>calculateFederalTax(i)).toThrow(/incomplete; calculation is unavailable/);expect(JSON.stringify(i)).toBe(before);}});
