// Spec: spec/federal/guided-rrta-payroll.yaml.
import { expect, it } from 'vitest';
import * as bridge from '@/lib/guided-interview-bridge';
import { emptySchedule1AData } from '@/lib/guided-schedule-1-a-facts';
import { validateSection, updateSectionData } from '@/lib/guided-interview-flow';
import { TaxYearInputSchema } from '@/models/inputs';
import { calculateFederalTax } from '@/engine/federal';
import { getConstants } from '@/models/constants';
import { nativeRRTA } from './guided-rrta-fixture';
function capture() { const s = nativeRRTA(), d = bridge.captureGuidedRRTAPayrollSources(s); need(s.sectionData['additional-deductions']).rrtaPayrollSources = { ...d, sourceFactsConfirmed: true }; return s; }
it('captures and emits the actual original RRTA source packet through the native bridge', () => {
    const state = capture(), before = structuredClone(state), raw = bridge.buildTaxInputFromGuidedData(state);
    expect(raw).not.toBeNull();
    const input = TaxYearInputSchema.parse(raw), r = calculateFederalTax(input);
    expect(input.rrtaPayrollSources?.originalTaxpayer).toEqual(input.taxpayer);
    expect(input.rrtaPayrollSources?.sources?.[0]?.originalW2).toEqual(input.w2s[0]);
    expect(r.form8959?.additionalMedicareTax.toFixed()).toBe('270');
    expect(r.form8959?.withholdingCredit.toFixed()).toBe('270');
    expect(r.form4137ByOwner?.primary?.line13.toFixed() ?? r.form4137?.line13.toFixed()).toBe('15');
    expect(r.totalWithholding.toFixed()).toBe('60270');
    expect(state).toEqual(before);
    expect(validateSection(state, 'additional-deductions').status).toBe('complete');
    expect(JSON.stringify(r)).not.toContain('Actual railroad annual payroll');
});
it('rejects stale original sources and retains facts across native edits and reload', () => {
    const state = capture(), saved = JSON.parse(JSON.stringify(state));
    expect(bridge.buildTaxInputFromGuidedData(saved)).not.toBeNull();
    const entries = structuredClone(need(state.sectionData['income-w2']));
    need(entries.entries[0]).wages = '230000.00';
    const edited = updateSectionData(state, 'income-w2', entries);
    expect(need(edited.sectionData['additional-deductions']).rrtaPayrollSources?.sourceFactsConfirmed).toBeNull();
    expect(need(edited.sectionData['additional-deductions']).rrtaPayrollSources?.capturedOriginal).toEqual(need(state.sectionData['additional-deductions']).rrtaPayrollSources?.capturedOriginal);
    expect(bridge.buildTaxInputFromGuidedData(edited)).toBeNull();
    const forged = structuredClone(edited);
    need(need(forged.sectionData['additional-deductions']).rrtaPayrollSources).sourceFactsConfirmed = true;
    expect(bridge.buildTaxInputFromGuidedData(forged)).toBeNull();
    const unchanged = updateSectionData(state, 'income-w2', structuredClone(state.sectionData['income-w2']));
    expect(need(unchanged.sectionData['additional-deductions']).rrtaPayrollSources?.sourceFactsConfirmed).toBe(true);
    expect(bridge.buildTaxInputFromGuidedData(unchanged)).not.toBeNull();
});
it('preserves unknown zero owner year and unsupported payroll refusals', () => {
    const state = capture();
    for (const alter of [(s: typeof state) => { s.taxYear = 2026; }, (s: typeof state) => { need(need(need(s.sectionData['additional-deductions']).rrtaPayrollSources).sources[0]).additionalMedicareTaxWithheld = ''; }, (s: typeof state) => { need(need(s.sectionData['additional-deductions']).rrtaPayrollSources).noCorrectionsConfirmed = null; }, (s: typeof state) => { need(need(need(s.sectionData['additional-deductions']).rrtaPayrollSources).sources[0]).owner = 'spouse'; }]) {
        const x = structuredClone(state);
        alter(x);
        expect(() => bridge.captureGuidedRRTAPayrollSources(x)).toThrow();
    }
    const zero = nativeRRTA();
    need(need(need(zero.sectionData['additional-deductions']).rrtaPayrollSources).sources[0]).additionalMedicareTaxWithheld = '0';
    const draft = bridge.captureGuidedRRTAPayrollSources(zero);
    need(zero.sectionData['additional-deductions']).rrtaPayrollSources = { ...draft, sourceFactsConfirmed: true };
    const r = calculateFederalTax(TaxYearInputSchema.parse(bridge.buildTaxInputFromGuidedData(zero)));
    expect(r.form8959?.withholdingCredit.toFixed()).toBe('0');
    expect(() => getConstants(2026)).toThrow();
});
it('reconciles each joint owner once and preserves actual source strings', () => {
    const s = nativeRRTA();
    s.segmentation.filingStatus = 'mfj';
    const a = need(s.sectionData['additional-deductions']), primary = need(need(a.tipIncomeAccounts)[0]), spouse = structuredClone(primary);
    spouse.accountHolder = 'spouse';
    spouse.railroadRetirementCompensation = '40000';
    need(spouse.employers[0]).sourceId = 'spouse-restaurant';
    need(spouse.employers[0]).employerEin = '33-3333333';
    need(a.tipIncomeAccounts).push(spouse);
    const w = structuredClone(need(need(s.sectionData['income-w2']).entries[0]));
    w.accountHolder = 'spouse';
    w.employerName = 'Spouse Railroad';
    w.employerEin = '44-4444444';
    w.wages = '40000';
    w.federalWithheld = '0';
    need(s.sectionData['income-w2']).entries.push(w);
    need(a.rrtaPayrollSources).sources.push({ ...structuredClone(need(need(a.rrtaPayrollSources).sources[0])), sourceId: 'spouse-rail', w2SourceId: 'formW2:1', owner: 'spouse', tier1SocialSecurityCompensation: '40000', tier1MedicareCompensation: '40000', additionalMedicareTaxWithheld: '50' });
    const d = bridge.captureGuidedRRTAPayrollSources(s);
    a.rrtaPayrollSources = { ...d, sourceFactsConfirmed: true };
    const input = TaxYearInputSchema.parse(bridge.buildTaxInputFromGuidedData(s)), r = calculateFederalTax(input);
    expect(input.rrtaPayrollSources?.originalTipForms).toHaveLength(2);
    expect(r.form8959?.additionalMedicareTax.toFixed()).toBe('180');
    expect(r.form8959?.withholdingCredit.toFixed()).toBe('320');
    expect(r.totalWithholding.toFixed()).toBe('60320');
});
it('requires every affirmative original eligibility answer and literal amount', () => {
    const group = ['allRRTASourcesIncludedConfirmed', 'noEmployeeRepresentativeCompensationConfirmed', 'noCorrectionsConfirmed', 'noOtherRRTATaxAdjustmentsConfirmed', 'noSelfEmploymentIncomeConfirmed'] as const;
    const row = ['sourceFactsConfirmed', 'ordinaryBox1EqualsMedicareCompensationConfirmed', 'nonRRTAPayrollBoxesKnownZeroConfirmed', 'noRailroadTipsConfirmed'] as const;
    for (const field of group)
        for (const answer of [null, false]) {
            const s = nativeRRTA();
            need(need(s.sectionData['additional-deductions']).rrtaPayrollSources)[field] = answer;
            expect(() => bridge.captureGuidedRRTAPayrollSources(s)).toThrow();
        }
    for (const field of row)
        for (const answer of [null, false]) {
            const s = nativeRRTA();
            need(need(need(s.sectionData['additional-deductions']).rrtaPayrollSources).sources[0])[field] = answer;
            expect(() => bridge.captureGuidedRRTAPayrollSources(s)).toThrow();
        }
    for (const field of ['tier1SocialSecurityCompensation', 'tier1MedicareCompensation', 'additionalMedicareTaxWithheld'] as const)
        for (const amount of ['', '-1', 'NaN', 'Infinity', '1.001']) {
            const s = nativeRRTA();
            need(need(need(s.sectionData['additional-deductions']).rrtaPayrollSources).sources[0])[field] = amount;
            expect(() => bridge.captureGuidedRRTAPayrollSources(s)).toThrow();
        }
    for (const modify of [(s: ReturnType<typeof nativeRRTA>) => { need(need(s.sectionData['additional-deductions']).rrtaPayrollSources).sources.push(structuredClone(need(need(need(s.sectionData['additional-deductions']).rrtaPayrollSources).sources[0]))); }, (s: ReturnType<typeof nativeRRTA>) => { need(need(need(need(s.sectionData['additional-deductions']).tipIncomeAccounts)[0]).employers[0]).railroadRetirementCovered = true; }, (s: ReturnType<typeof nativeRRTA>) => { need(need(s.sectionData['income-w2']).entries[0]).medicareWages = '1'; }]) {
        const s = nativeRRTA();
        modify(s);
        expect(() => bridge.captureGuidedRRTAPayrollSources(s)).toThrow();
    }
});
it('revokes documentary reference edits while capture does not confirm other facts', () => {
    const s = capture(), a = structuredClone(need(s.sectionData['additional-deductions']));
    need(need(a.rrtaPayrollSources).sources[0]).sourceReference += ' corrected';
    const edited = updateSectionData(s, 'additional-deductions', a);
    expect(need(edited.sectionData['additional-deductions']).rrtaPayrollSources?.sourceFactsConfirmed).toBeNull();
    expect(need(need(need(edited.sectionData['additional-deductions']).tipIncomeAccounts)[0]).sourceFactsConfirmed).toBe(true);
    expect(bridge.buildTaxInputFromGuidedData(edited)).toBeNull();
    const d = bridge.captureGuidedRRTAPayrollSources(edited);
    expect(d.sourceFactsConfirmed).toBeNull();
    expect(d.capturedOriginal?.packet.sourceFactsConfirmed).toBe(true);
    expect(need(s.sectionData['additional-deductions']).rrtaPayrollSources?.capturedOriginal?.packet.sources?.[0]?.sourceReference).not.toContain('corrected');
    const zero = nativeRRTA();
    need(need(zero.sectionData['income-w2']).entries[0]).wages = '0';
    need(need(need(zero.sectionData['additional-deductions']).tipIncomeAccounts)[0]).railroadRetirementCompensation = '0';
    const row = need(need(need(zero.sectionData['additional-deductions']).rrtaPayrollSources).sources[0]);
    row.tier1SocialSecurityCompensation = '0';
    row.tier1MedicareCompensation = '0';
    row.additionalMedicareTaxWithheld = '0';
    expect(bridge.captureGuidedRRTAPayrollSources(zero).capturedOriginal?.packet.sources?.[0]?.tier1MedicareCompensation).toBe('0');
});
it('reconciles original RRTA capture with actual nonrailroad Schedule1A sources without a confirmation cycle', () => {
    const state = nativeRRTA();
    need(need(state.sectionData['income-w2']).entries[0]).wages = '100000';
    const a = need(state.sectionData['additional-deductions']);
    need(need(a.tipIncomeAccounts)[0]).railroadRetirementCompensation = '100000';
    need(need(a.rrtaPayrollSources).sources[0]).tier1SocialSecurityCompensation = '100000';
    need(need(a.rrtaPayrollSources).sources[0]).tier1MedicareCompensation = '100000';
    need(need(a.rrtaPayrollSources).sources[0]).additionalMedicareTaxWithheld = '0';
    a.schedule1A = { ...emptySchedule1AData, sourceTaxYear: '2025', sourceReference: 'Actual nonrailroad occupation and diary', sourceFactsConfirmed: true, allSourcesIncluded: true, excludedPuertoRicoIncome: '0', form4563Exclusion: '0', employeeTips: [{ owner: 'primary', occupationCode: '102', eligibleOccupation: true, voluntaryCashTips: true, lawfulActivity: true, meetsSstbRuleOrTransition: true, employer: 'Blue Ocean Restaurant', w2SourceIds: [], form4137EmployerSourceId: 'restaurant', reportingMethod: 'form4137', reportingSourceReference: 'Actual employer diary', reportedEmployerTips: '', qualifiedW2Tips: '0', qualifiedForm4137Tips: '1000' }] };
    const d = bridge.captureGuidedRRTAPayrollSources(state);
    const captured = updateSectionData(state, 'additional-deductions', { ...a, rrtaPayrollSources: d });
    expect(need(captured.sectionData['additional-deductions']).schedule1A?.sourceFactsConfirmed).toBe(true);
    const confirmed = updateSectionData(captured, 'additional-deductions', { ...captured.sectionData['additional-deductions'], rrtaPayrollSources: { ...d, sourceFactsConfirmed: true } });
    const input = TaxYearInputSchema.parse(bridge.buildTaxInputFromGuidedData(confirmed)), r = calculateFederalTax(input);
    expect(r.schedule1A?.tipsDeduction.toFixed()).toBe('1000');
    expect(r.form4137ByOwner?.primary?.line13.toFixed() ?? r.form4137?.line13.toFixed()).toBe('77');
    const noProof = structuredClone(confirmed);
    delete need(need(noProof.sectionData['additional-deductions']).rrtaPayrollSources).capturedOriginal;
    expect(bridge.buildTaxInputFromGuidedData(noProof)).toBeNull();
    const stale = structuredClone(confirmed);
    need(need(stale.sectionData['income-w2']).entries[0]).employerName += ' edited';
    expect(bridge.buildTaxInputFromGuidedData(stale)).toBeNull();
});

function need<T>(value:T|null|undefined):T {if(value==null)throw Error('Required fictional fixture value');return value;}
