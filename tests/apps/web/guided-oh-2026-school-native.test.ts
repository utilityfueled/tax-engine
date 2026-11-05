/** Spec: state/oh-2026-school-native.yaml. Literal source outcomes, not computed tax oracles. */
import { expect, it } from 'vitest';
import { emptyOhio2026SchoolDraft, emptyOhio2026SchoolEmployment, emptyOhio2026SchoolPayroll, captureGuidedOhio2026SchoolOriginals, confirmGuidedOhio2026SchoolSource, buildGuidedOhio2026SchoolSource, normalizeOhio2026SchoolCash } from '@/lib/guided-ohio-2026-school-sources';
import { ohio2026NativeOriginalFixture, enteredOhio2026SchoolDraft } from '../../fixtures/guided-oh-2026-school-native';
import { readOhio2026SchoolSource, calculateOhio2026SchoolSource } from '@/engine/state/oh-2026-school-source';
function complete() { const f = ohio2026NativeOriginalFixture(), draft = captureGuidedOhio2026SchoolOriginals(f.baseInput, enteredOhio2026SchoolDraft()); return { ...f, draft: confirmGuidedOhio2026SchoolSource(f.baseInput, draft) }; }
it('requires separate capture and current exact source confirmation', () => { const f = ohio2026NativeOriginalFixture(), d = enteredOhio2026SchoolDraft(), before = structuredClone(d); expect(() => confirmGuidedOhio2026SchoolSource(f.baseInput, d)).toThrow(/capture/); expect(d).toEqual(before); const captured = captureGuidedOhio2026SchoolOriginals(f.baseInput, d); expect(captured.sourceFactsConfirmed).toBeNull(); expect(captured.originalTaxInput).toBeUndefined(); expect(() => buildGuidedOhio2026SchoolSource(f.baseInput, { ...captured, sourceFactsConfirmed: true })).toThrow(); const confirmed = confirmGuidedOhio2026SchoolSource(f.baseInput, captured); expect(confirmed.sourceFactsConfirmed).toBe(true); expect(confirmed.originalTaxInput?.ohioResidency).toBeDefined(); expect(captured.originalTaxInput).toBeUndefined(); expect(d).toEqual(before); });
it('projects documentary amounts with every settlement field unknown', () => {
    const f = complete(), before = structuredClone(f), r = buildGuidedOhio2026SchoolSource(f.baseInput, f.draft);
    expect(r).toMatchObject({ taxYear: 2026, districtCode: '0302', districtName: 'Hillsdale LSD', taxBase: 'earned', rate: '0.0125', residentCompensation: '50000', schoolWithholding: '625.25', taxLiability: null, payments: null, refund: null, underpaymentPenalty: null, lateInterest: null, filingQualified: false, calculationStatus: 'source-only-incomplete' });
    for (const marker of [f.baseInput.taxpayer.primary.ssn, f.baseInput.taxpayer.address.street, f.draft.sourceReference, f.draft.employmentOriginals[0].employerTin])
        expect(JSON.stringify(r)).not.toContain(marker);
    r.residentCompensation = 'forged';
    expect(buildGuidedOhio2026SchoolSource(f.baseInput, f.draft).residentCompensation).toBe('50000');
    expect(f).toEqual(before);
});
it('starts every source primitive unknown and capture infers no source facts', () => { const f = ohio2026NativeOriginalFixture(), empty = emptyOhio2026SchoolDraft(), d = captureGuidedOhio2026SchoolOriginals(f.baseInput, empty); expect(empty.taxYear).toBe(''); expect(empty.owner.accountHolder).toBe(''); expect(empty.residency.owners).toEqual([]); expect(empty.income.noOtherIncomeOrAdjustmentsConfirmed).toBeNull(); expect(empty.noStateAdjustmentsConfirmed).toBeNull(); expect(d.taxYear).toBe(''); expect(d.residence.finder).toEqual(empty.residence.finder); expect(d.residence.from).toBe(''); expect(d.residence.districtCode).toBe(''); expect(d.employmentOriginals).toEqual([]); expect(d.w2Sources).toEqual([]); expect(d.owner.originalTaxpayer).toEqual(f.baseInput.taxpayer.primary); expect(emptyOhio2026SchoolEmployment().w2Index).toBeNull(); expect(emptyOhio2026SchoolPayroll().wages).toBe(''); });
it.each(['wages', 'capitalGains', 'rentsRoyalties', 'gambling', 'interestDividends', 'pensions', 'unemployment', 'otherIncome', 'federalAdjustments'] as const)('rejects unknown category rather than treating it as zero: %s', category => {
    const f = complete();
    const owner = f.draft.residency.owners[0];
    if (!owner.amounts)
        throw Error('Actual categories required');
    owner.amounts[category].nonresidentOhioAmount = '';
    expect(() => confirmGuidedOhio2026SchoolSource(f.baseInput, f.draft)).toThrow();
    expect(owner.amounts[category].nonresidentOhioAmount).toBe('');
});
it.each(['owner', 'home', 'employer', 'printed locality', 'wage cash', 'actual year', 'source reference'] as const)('revokes changed current originals without silently recapturing: %s', kind => {
    const f = complete(), old = structuredClone(f.draft.originalTaxInput);
    if (kind === 'owner')
        f.baseInput.taxpayer.primary.firstName = 'Replaced';
    if (kind === 'home')
        f.baseInput.taxpayer.address.street = 'Other actual home';
    if (kind === 'employer')
        f.baseInput.w2s[0].employer.name = 'Other same-cash employer';
    if (kind === 'printed locality')
        f.baseInput.w2s[0].localityName = 'CITY OF COLUMBUS';
    if (kind === 'wage cash')
        f.baseInput.w2s[0].wages = '50000.01';
    if (kind === 'actual year')
        f.baseInput.taxpayer.taxYear = 2025;
    if (kind === 'source reference') {
        const s = f.baseInput.w2s[0].stateLocalSources;
        if (!s)
            throw Error('Actual source required');
        s.sourceReference = 'Equal-cash replacement W2 original';
    }
    expect(() => buildGuidedOhio2026SchoolSource(f.baseInput, f.draft)).toThrow();
    expect(f.draft.originalTaxInput).toEqual(old);
});
it('denies forged or stale opaque source contexts at the existing API', () => { const f = ohio2026NativeOriginalFixture(), c = calculateOhio2026SchoolSource(f.canonical, f.sources); expect(() => readOhio2026SchoolSource({ ...c }, f.canonical, f.sources)).toThrow(/forged/); f.sources.residence.finder.sourceReference += ' replaced'; expect(() => readOhio2026SchoolSource(c, f.canonical, f.sources)).toThrow(/stale/); });
it.each(['residence', 'Finder', 'payroll', 'local row'] as const)('requires reconfirming changed same-cash source provenance: %s', kind => {
    const f = complete(), before = structuredClone(f.draft.originalTaxInput);
    if (kind === 'residence')
        f.draft.residence.sourceReference += ' replaced';
    if (kind === 'Finder')
        f.draft.residence.finder.sourceReference += ' replaced';
    if (kind === 'payroll')
        f.draft.employmentOriginals[0].serviceRows[0].sourceReference += ' replaced';
    if (kind === 'local row')
        f.draft.w2Sources[0].localRows[0].sourceReference += ' replaced'; // The engine compares current sources to an opaque current context, while native confirmation binds entered originals.
    expect(() => buildGuidedOhio2026SchoolSource(f.baseInput, f.draft)).toThrow(/confirmation/);
    const d = confirmGuidedOhio2026SchoolSource(f.baseInput, f.draft);
    expect(buildGuidedOhio2026SchoolSource(f.baseInput, d).residentCompensation).toBe('50000');
    expect(f.draft.originalTaxInput).toEqual(before);
});
it.each(['ohioResidency', 'ohioPayments', 'ohioSchoolDistrict', 'ohioReturnHeaderSources'] as const)('does not overwrite a retained canonical Ohio root: %s', key => { const f = ohio2026NativeOriginalFixture(), base = structuredClone(f.baseInput); Reflect.set(base, key, {}); const before = structuredClone(base); expect(() => captureGuidedOhio2026SchoolOriginals(base, enteredOhio2026SchoolDraft())).toThrow(/reconciliation/); expect(base).toEqual(before); });
it.each(['2025', 'traditional', 'part_year', 'joint', 'self_employment', 'municipal'] as const)('keeps unsupported method guards closed: %s', kind => {
    const f = complete();
    if (kind === '2025')
        f.draft.taxYear = '2025';
    if (kind === 'traditional')
        f.draft.residence.finder.taxBase = 'traditional';
    if (kind === 'part_year')
        f.draft.residency.owners[0].status = 'part_year_resident';
    if (kind === 'joint')
        f.baseInput.taxpayer.filingStatus = 'married_filing_jointly';
    if (kind === 'self_employment')
        f.draft.income.noSelfEmploymentConfirmed = false;
    if (kind === 'municipal')
        f.draft.w2Sources[0].localRows[0].classification = 'municipal';
    expect(() => confirmGuidedOhio2026SchoolSource(f.baseInput, f.draft)).toThrow();
});
it('preserves exact cash zero, malformed grouping and unknown strings', () => { expect(normalizeOhio2026SchoolCash('0')).toBe('0'); expect(normalizeOhio2026SchoolCash('')).toBe(''); expect(normalizeOhio2026SchoolCash('1,0')).toBe('1,0'); expect(normalizeOhio2026SchoolCash('50,000.00')).toBe('50000.00'); const f = complete(); f.draft.employmentOriginals[0].serviceRows[0].wages = '1,0'; expect(() => confirmGuidedOhio2026SchoolSource(f.baseInput, f.draft)).toThrow(); expect(f.draft.employmentOriginals[0].serviceRows[0].wages).toBe('1,0'); });
it('projects explicitly documented zero withholding and rejects unknown original withholding', () => { const f = ohio2026NativeOriginalFixture(), w = f.baseInput.w2s[0]; if (!w.stateLocalSources)
    throw Error('Actual original local rows required'); w.localTaxWithheld = '0'; w.stateLocalSources.localRows[0].withheld = '0'; const { stateLocalSources: _proof, ...actualW2 } = w; w.stateLocalSources.originalW2 = structuredClone(actualW2); const d = confirmGuidedOhio2026SchoolSource(f.baseInput, captureGuidedOhio2026SchoolOriginals(f.baseInput, enteredOhio2026SchoolDraft())); expect(buildGuidedOhio2026SchoolSource(f.baseInput, d)).toMatchObject({ schoolWithholding: '0', taxLiability: null, payments: null, filingQualified: false }); w.localTaxWithheld = ''; w.stateLocalSources.localRows[0].withheld = ''; const { stateLocalSources: _unknown, ...unknownW2 } = w; w.stateLocalSources.originalW2 = structuredClone(unknownW2); expect(() => confirmGuidedOhio2026SchoolSource(f.baseInput, captureGuidedOhio2026SchoolOriginals(f.baseInput, d))).toThrow(); expect(w.stateLocalSources.localRows[0].withheld).toBe(''); });
